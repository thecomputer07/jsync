import { Ionicons } from '@expo/vector-icons';
import { useEventListener } from 'expo';
import { useKeepAwake } from 'expo-keep-awake';
import * as NavigationBar from 'expo-navigation-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Focusable } from '@/components/focusable';
import { SeekBar } from '@/components/player/seek-bar';
import { TrackSheet } from '@/components/player/track-sheet';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui';
import { itemSubtitle, secondsToTicks, ticksToSeconds } from '@/lib/jellyfin/client';
import { resolveStream, type ResolvedStream } from '@/lib/jellyfin/playback';
import type { BaseItem, MediaSegment, MediaStream } from '@/lib/jellyfin/types';
import { lockAppOrientation, lockPlayerOrientation } from '@/lib/orientation';
import { playerState } from '@/lib/player-state';
import { useTVEventHandler } from '@/lib/tv';
import type { SyncPlayer } from '@/lib/syncplay/manager';
import { useClient, useSession, useSyncPlayState } from '@/state/session';
import { colors, font, radius, space, tv } from '@/theme';

const HIDE_AFTER_MS = 4000;
const NEXT_COUNTDOWN = 10;

/** Il player nativo può essere già rilasciato (uscita dalla schermata): ogni accesso tardivo passa da qui. */
function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function pickByLang(streams: MediaStream[], lang: string) {
  if (!lang) return undefined;
  const l = lang.toLowerCase();
  return streams.find((s) => (s.Language ?? '').toLowerCase().startsWith(l));
}

export default function PlayerScreen() {
  useKeepAwake();
  const params = useLocalSearchParams<{ id?: string; start?: string; group?: string }>();
  const c = useClient();
  const { syncplay, settings } = useSession();
  const sp = useSyncPlayState();
  const insets = useSafeAreaInsets();
  const groupMode = params.group === '1';

  // Cosa riprodurre: in gruppo lo decide il server (sp.current), altrimenti i parametri.
  const target = groupMode
    ? sp.current
      ? { itemId: sp.current.itemId, seq: sp.current.seq }
      : null
    : params.id
      ? { itemId: params.id, seq: 0 }
      : null;

  const [item, setItem] = useState<BaseItem | null>(null);
  const [stream, setStream] = useState<ResolvedStream | null>(null);
  const [segments, setSegments] = useState<MediaSegment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [controls, setControls] = useState(true);
  const [tracksOpen, setTracksOpen] = useState(false);
  const [nextEp, setNextEp] = useState<BaseItem | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [ended, setEnded] = useState(false);

  const player = useVideoPlayer(null, (p) => {
    p.timeUpdateEventInterval = 0.25;
    p.keepScreenOnWhilePlaying = true;
    p.staysActiveInBackground = false;
  });

  // Ref per i callback (eventi nativi e timer non devono vedere stato vecchio).
  const r = useRef({
    stream: null as ResolvedStream | null,
    item: null as BaseItem | null,
    startSec: 0,
    loadToken: 0,
    firstReady: false,
    wasReady: false,
    reportedStart: false,
    lastReport: 0,
    skipped: new Set<string>(),
    hideTimer: null as ReturnType<typeof setTimeout> | null,
    readyWaiters: [] as (() => void)[],
    // Ultimi valori noti: il report finale avviene quando il player nativo è già stato liberato.
    pos: 0,
    isPlaying: false,
  }).current;

  // ── orientamento, barre di sistema, stato globale ──
  useEffect(() => {
    playerState.mounted = true;
    lockPlayerOrientation();
    if (Platform.OS === 'android' && !tv) NavigationBar.setVisibilityAsync('hidden').catch(() => {});
    return () => {
      playerState.mounted = false;
      lockAppOrientation();
      if (Platform.OS === 'android' && !tv) NavigationBar.setVisibilityAsync('visible').catch(() => {});
    };
  }, []);

  // ── report a Jellyfin (progressi = "continua a guardare" sul server) ──
  const report = useCallback(
    (kind: 'start' | 'progress' | 'stop', extra?: Record<string, unknown>) => {
      const s = r.stream;
      const it = r.item;
      if (!s || !it) return;
      c.reportPlaying(kind, {
        ItemId: it.Id,
        MediaSourceId: s.mediaSource.Id,
        PlaySessionId: s.playSessionId,
        PositionTicks: secondsToTicks(r.pos),
        IsPaused: !r.isPlaying,
        PlayMethod: s.playMethod,
        AudioStreamIndex: s.audioIndex,
        SubtitleStreamIndex: s.subtitleIndex ?? -1,
        CanSeek: true,
        ...extra,
      });
    },
    [c, r],
  );

  const stopReporting = useCallback(() => {
    if (r.stream && r.reportedStart) {
      report('stop');
      c.stopEncoding(r.stream.playSessionId);
    }
    r.reportedStart = false;
  }, [c, r, report]);

  // ── caricamento ──
  const load = useCallback(
    async (itemId: string, startSec: number, tracks?: { audio?: number; subtitle?: number }) => {
      const token = ++r.loadToken;
      stopReporting();
      setLoading(true);
      setError(null);
      setEnded(false);
      setCountdown(null);
      r.firstReady = false;
      r.wasReady = false;
      r.startSec = startSec;
      try {
        const it = r.item?.Id === itemId ? r.item : await c.item(itemId);
        if (token !== r.loadToken) return;
        r.item = it;
        setItem(it);

        // Lingue preferite (solo al primo caricamento di un elemento).
        let audio = tracks?.audio;
        let subtitle = tracks?.subtitle;
        if (!tracks) {
          const streams = it.MediaStreams ?? it.MediaSources?.[0]?.MediaStreams ?? [];
          audio = pickByLang(streams.filter((s) => s.Type === 'Audio'), settings.preferredAudioLang)?.Index;
          subtitle = pickByLang(streams.filter((s) => s.Type === 'Subtitle'), settings.preferredSubtitleLang)?.Index;
        }

        const s = await resolveStream(c, itemId, {
          startTicks: secondsToTicks(startSec),
          audioIndex: audio,
          subtitleIndex: subtitle,
          maxBitrate: settings.maxBitrate,
          burnSubtitles: settings.burnSubtitles,
        });
        if (token !== r.loadToken) return;
        r.stream = s;
        setStream(s);
        setDuration(ticksToSeconds(s.mediaSource.RunTimeTicks ?? it.RunTimeTicks));

        await player.replaceAsync({
          uri: s.uri,
          contentType: s.contentType,
          metadata: {
            title: it.Type === 'Episode' ? `${it.SeriesName} · ${it.Name}` : it.Name,
            artist: it.Type === 'Episode' ? itemSubtitle(it) : undefined,
          },
        });

        // Segmenti (intro/riassunto/titoli) e prossimo episodio, in parallelo.
        c.segments(itemId).then((seg) => token === r.loadToken && setSegments(seg));
        if (it.Type === 'Episode' && it.SeriesId) {
          c.episodes(it.SeriesId, undefined, it.Id, 2)
            .then((res) => token === r.loadToken && setNextEp(res.Items[1] ?? null))
            .catch(() => {});
        } else setNextEp(null);
      } catch (e: any) {
        if (token !== r.loadToken) return;
        setError(e?.message ?? 'Impossibile riprodurre.');
        setLoading(false);
      }
    },
    [c, player, r, settings, stopReporting],
  );

  // Carica all'avvio e a ogni cambio di elemento (in gruppo: ogni nuova coda/prossimo episodio).
  useEffect(() => {
    if (!target) return;
    r.skipped.clear();
    const start = groupMode && syncplay ? ticksToSeconds(syncplay.estimatedStartTicks()) : ticksToSeconds(Number(params.start ?? 0));
    // load() è il caricamento dei dati: deve partire qui, al cambio di elemento.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(target.itemId, start);
  }, [target?.itemId, target?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  // In gruppo e la coda è sparita (gruppo chiuso, uscita): si chiude.
  useEffect(() => {
    if (groupMode && !sp.group) router.back();
  }, [groupMode, sp.group]);

  // Uscita: report finale e sgancio dal gruppo.
  useEffect(() => {
    return () => {
      r.loadToken++;
      if (r.hideTimer) clearTimeout(r.hideTimer);
      r.readyWaiters.splice(0).forEach((fn) => fn());
      stopReporting();
    };
  }, [r, stopReporting]);

  // ── aggancio SyncPlay ──
  const syncAdapter = useMemo<SyncPlayer>(
    () => ({
      currentTime: () => safe(() => player.currentTime || 0, r.pos),
      isPlaying: () => safe(() => player.playing, false),
      play: () => safe(() => player.play(), undefined),
      pause: () => safe(() => player.pause(), undefined),
      seek: (s) => {
        safe(() => {
          player.currentTime = Math.max(0, s);
        }, undefined);
        r.pos = Math.max(0, s);
      },
      setRate: (rate) => {
        safe(() => {
          player.playbackRate = rate;
        }, undefined);
      },
      waitReady: (ms) =>
        new Promise<void>((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            resolve();
          };
          r.readyWaiters.push(finish);
          // Un seek su file progressivo spesso non cambia stato: dopo poco lo consideriamo pronto.
          setTimeout(() => safe(() => player.status, 'idle') === 'readyToPlay' && finish(), 1200);
          setTimeout(finish, ms);
        }),
      stop: () => router.back(),
    }),
    [player, r],
  );

  useEffect(() => {
    if (!groupMode || !syncplay) return;
    syncplay.attachPlayer(syncAdapter);
    return () => syncplay.detachPlayer(syncAdapter);
  }, [groupMode, syncplay, syncAdapter]);

  // ── eventi del player ──
  useEventListener(player, 'statusChange', ({ status, error: err }) => {
    if (status === 'readyToPlay') {
      r.readyWaiters.splice(0).forEach((fn) => fn());
      if (!r.firstReady) {
        r.firstReady = true;
        r.wasReady = true;
        setLoading(false);
        if (r.startSec > 1) player.currentTime = r.startSec;
        applyPlayerSubtitle();
        if (groupMode && syncplay) {
          syncplay.onPlayerLoaded();
        } else {
          player.play();
        }
        report('start');
        r.reportedStart = true;
      } else if (!r.wasReady) {
        r.wasReady = true;
        setLoading(false);
        if (groupMode) syncplay?.onBufferingEnd();
      }
    } else if (status === 'loading' && r.firstReady) {
      r.wasReady = false;
      setLoading(true);
      if (groupMode) syncplay?.onBufferingStart();
    } else if (status === 'error') {
      setLoading(false);
      setError(err?.message ? `Errore di riproduzione: ${err.message}` : 'Errore di riproduzione.');
    }
  });

  useEventListener(player, 'playingChange', ({ isPlaying }) => {
    r.isPlaying = isPlaying;
    setPlaying(isPlaying);
    if (r.reportedStart) report('progress', { EventName: isPlaying ? 'unpause' : 'pause' });
    if (isPlaying) scheduleHide();
  });

  useEventListener(player, 'timeUpdate', ({ currentTime, bufferedPosition }) => {
    r.pos = currentTime;
    setPosition(currentTime);
    if (bufferedPosition >= 0) setBuffered(bufferedPosition);
    if (player.duration > 0 && Math.abs(player.duration - duration) > 1) setDuration(player.duration);
    if (groupMode) syncplay?.onTimeUpdate(currentTime);
    const now = Date.now();
    if (r.reportedStart && now - r.lastReport > 10_000) {
      r.lastReport = now;
      report('progress', { EventName: 'timeupdate' });
    }
    autoSkip(currentTime);
  });

  useEventListener(player, 'playToEnd', () => {
    setEnded(true);
    report('stop', { PositionTicks: secondsToTicks(safe(() => player.duration, 0) || duration) });
    r.reportedStart = false;
    if (groupMode) {
      syncplay?.onEnded();
      return;
    }
    if (nextEp && settings.autoPlayNext) setCountdown(NEXT_COUNTDOWN);
  });

  useEventListener(player, 'availableSubtitleTracksChange', () => applyPlayerSubtitle());

  /** Coi sottotitoli via HLS il server li mette nella playlist: va accesa la traccia nel player. */
  function applyPlayerSubtitle() {
    const s = r.stream;
    if (!s) return;
    const wanted = s.subtitleStreams.find((x) => x.Index === s.subtitleIndex);
    const tracks = player.availableSubtitleTracks ?? [];
    if (!wanted || wanted.DeliveryMethod === 'Encode') {
      if (player.subtitleTrack) player.subtitleTrack = null;
      return;
    }
    if (!tracks.length) return;
    const lang = (wanted.Language ?? '').toLowerCase();
    const match = tracks.find((t) => lang && (t.language ?? '').toLowerCase().startsWith(lang.slice(0, 2))) ?? tracks[0];
    player.subtitleTrack = match;
  }

  // ── salta intro / riassunto ──
  const activeSegment = segments.find(
    (s) => (s.Type === 'Intro' || s.Type === 'Recap') && position >= ticksToSeconds(s.StartTicks) && position < ticksToSeconds(s.EndTicks) - 1,
  );
  const inOutro =
    !!nextEp &&
    (segments.some((s) => s.Type === 'Outro' && position >= ticksToSeconds(s.StartTicks)) ||
      (duration > 0 && duration - position < 25 && duration > 120));

  function autoSkip(t: number) {
    if (groupMode) return; // in gruppo si salta a mano: un seek per tutti, non uno per persona
    for (const s of segments) {
      const auto = (s.Type === 'Intro' && settings.autoSkipIntro) || (s.Type === 'Recap' && settings.autoSkipRecap);
      if (!auto) continue;
      const key = `${s.Type}:${s.StartTicks}`;
      const a = ticksToSeconds(s.StartTicks);
      const b = ticksToSeconds(s.EndTicks);
      if (t >= a && t < b - 1 && !r.skipped.has(key)) {
        r.skipped.add(key);
        player.currentTime = b;
        toast(s.Type === 'Intro' ? 'Intro saltata' : 'Riassunto saltato');
      }
    }
  }

  // ── azioni utente ──
  const togglePlay = () => {
    if (groupMode && syncplay) {
      (player.playing ? syncplay.requestPause() : syncplay.requestUnpause()).catch(() => {});
    } else if (player.playing) player.pause();
    else {
      if (ended) player.currentTime = 0;
      setEnded(false);
      player.play();
    }
    scheduleHide();
  };

  const seekTo = (sec: number) => {
    const t = Math.max(0, Math.min(duration || sec, sec));
    if (groupMode && syncplay) syncplay.requestSeek(t).catch(() => {});
    else player.currentTime = t;
    r.pos = t;
    setPosition(t);
    scheduleHide();
  };

  const skipBy = (d: number) => seekTo((player.currentTime || 0) + d);

  const playNext = () => {
    setCountdown(null);
    if (groupMode && syncplay) {
      syncplay.requestNext()?.catch(() => {});
      return;
    }
    if (nextEp) router.setParams({ id: nextEp.Id, start: '0' });
  };

  const pickTrack = (kind: 'audio' | 'subtitle', index: number) => {
    setTracksOpen(false);
    const s = r.stream;
    const it = r.item;
    if (!s || !it) return;
    const audio = kind === 'audio' ? index : s.audioIndex;
    const subtitle = kind === 'subtitle' ? index : s.subtitleIndex;
    if (audio === s.audioIndex && subtitle === s.subtitleIndex) return;
    // In riproduzione diretta tutte le tracce audio sono già nel file: si cambia senza ricaricare.
    if (kind === 'audio' && s.playMethod === 'DirectPlay' && player.availableAudioTracks.length > 1) {
      const wanted = s.audioStreams.find((x) => x.Index === index);
      const lang = (wanted?.Language ?? '').toLowerCase();
      const pos = s.audioStreams.findIndex((x) => x.Index === index);
      const t = player.availableAudioTracks.find((x) => lang && (x.language ?? '').toLowerCase().startsWith(lang.slice(0, 2))) ?? player.availableAudioTracks[pos];
      if (t) {
        player.audioTrack = t;
        r.stream = { ...s, audioIndex: index };
        setStream(r.stream);
        return;
      }
    }
    if (groupMode) syncplay?.onLocalReload();
    load(it.Id, player.currentTime || 0, { audio, subtitle });
  };

  // Countdown prossimo episodio (da soli).
  useEffect(() => {
    if (countdown == null) return;
    if (countdown <= 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fine del conto alla rovescia
      playNext();
      return;
    }
    const t = setTimeout(() => setCountdown((x) => (x == null ? null : x - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown]); // eslint-disable-line react-hooks/exhaustive-deps

  // Solo: quando cambia ?id= (prossimo episodio) ricarica.
  useEffect(() => {
    if (!groupMode && params.id && r.item && params.id !== r.item.Id) {
      r.skipped.clear();
      load(params.id, ticksToSeconds(Number(params.start ?? 0)));
    }
  }, [params.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── controlli a scomparsa ──
  function scheduleHide() {
    if (r.hideTimer) clearTimeout(r.hideTimer);
    r.hideTimer = setTimeout(() => {
      if (safe(() => player.playing, false)) setControls(false);
    }, HIDE_AFTER_MS);
  }
  const showControls = () => {
    setControls(true);
    scheduleHide();
  };

  // ── telecomando TV ──
  useTVEventHandler((evt) => {
    if (!evt || tracksOpen) return;
    const type = evt.eventType;
    if (evt.eventKeyAction === 1) return; // solo pressione, non rilascio
    if (type === 'playPause') return togglePlay();
    if (type === 'fastForward') return skipBy(30);
    if (type === 'rewind') return skipBy(-10);
    if (!controls) {
      if (type === 'left') return skipBy(-10);
      if (type === 'right') return skipBy(10);
      if (type === 'select' || type === 'up' || type === 'down') return showControls();
    } else {
      scheduleHide();
    }
  });

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (tracksOpen) {
        setTracksOpen(false);
        return true;
      }
      if (tv && controls && player.playing) {
        setControls(false);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [tracksOpen, controls, player]);

  const close = () => router.back();

  const waiting = groupMode && sp.state === 'Waiting';
  const title = item ? (item.Type === 'Episode' ? item.Name : item.Name) : '';
  const subtitle = item?.Type === 'Episode' ? itemSubtitle(item) : item?.ProductionYear ? String(item.ProductionYear) : '';

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        nativeControls={false}
        contentFit="contain"
        allowsPictureInPicture={!groupMode}
      />

      <Pressable style={StyleSheet.absoluteFill} onPress={() => (controls ? setControls(false) : showControls())} focusable={false} />

      {(loading || waiting) && !error ? (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator size="large" color="#fff" />
          {waiting ? <Text style={styles.waitText}>In attesa degli altri…</Text> : null}
        </View>
      ) : null}

      {error ? (
        <View style={[styles.center, { gap: space.lg, padding: space.xl, backgroundColor: 'rgba(0,0,0,0.75)' }]}>
          <Text style={styles.errorText}>{error}</Text>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            {target ? <Button title="Riprova" variant="secondary" onPress={() => load(target.itemId, position)} hasTVPreferredFocus={tv} /> : null}
            <Button title="Chiudi" variant="ghost" onPress={close} />
          </View>
        </View>
      ) : null}

      {controls && !error ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <View style={styles.shadeTop} pointerEvents="none" />
          <View style={styles.shadeBottom} pointerEvents="none" />

          <View style={[styles.top, { paddingLeft: Math.max(insets.left, space.lg), paddingRight: Math.max(insets.right, space.lg), paddingTop: Math.max(insets.top, space.md) }]}>
            <Focusable onPress={close} style={styles.iconBtn} zoom={false}>
              <Ionicons name={tv ? 'arrow-back' : 'chevron-down'} size={28} color="#fff" />
            </Focusable>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {groupMode && sp.group ? (
              <View style={styles.groupPill}>
                <View style={[styles.dot, { backgroundColor: sp.syncing ? '#FACC15' : colors.success }]} />
                <Text style={styles.groupPillText} numberOfLines={1}>
                  {sp.group.GroupName} · {sp.group.Participants?.length ?? 1}
                  {sp.syncing ? `  ${sp.syncing}` : ''}
                </Text>
              </View>
            ) : null}
            <Focusable onPress={() => setTracksOpen(true)} style={styles.iconBtn} zoom={false}>
              <Ionicons name="chatbox-ellipses-outline" size={24} color="#fff" />
            </Focusable>
          </View>

          <View style={styles.middle} pointerEvents="box-none">
            <Focusable onPress={() => skipBy(-10)} style={styles.roundBtn} zoom={false}>
              <Ionicons name="play-back" size={tv ? 34 : 28} color="#fff" />
              <Text style={styles.roundLabel}>10</Text>
            </Focusable>
            <Focusable onPress={togglePlay} style={[styles.roundBtn, styles.playBtn]} zoom={false} hasTVPreferredFocus={tv}>
              <Ionicons name={playing ? 'pause' : ended ? 'refresh' : 'play'} size={tv ? 54 : 44} color="#fff" />
            </Focusable>
            <Focusable onPress={() => skipBy(10)} style={styles.roundBtn} zoom={false}>
              <Ionicons name="play-forward" size={tv ? 34 : 28} color="#fff" />
              <Text style={styles.roundLabel}>10</Text>
            </Focusable>
          </View>

          <View style={[styles.bottom, { paddingLeft: Math.max(insets.left, space.lg), paddingRight: Math.max(insets.right, space.lg), paddingBottom: Math.max(insets.bottom, space.md) }]}>
            <SeekBar
              position={position}
              duration={duration}
              buffered={buffered}
              segments={segments}
              onSeek={seekTo}
              onScrubStart={() => r.hideTimer && clearTimeout(r.hideTimer)}
            />
            <View style={styles.bottomRow}>
              {stream ? (
                <Text style={styles.method}>
                  {stream.playMethod === 'DirectPlay' ? 'Diretta' : stream.playMethod === 'DirectStream' ? 'Remux' : 'Transcodifica'}
                </Text>
              ) : null}
              <View style={{ flex: 1 }} />
              {nextEp ? (
                <Focusable onPress={playNext} style={styles.textBtn} zoom={false}>
                  <Text style={styles.textBtnLabel}>Prossimo episodio</Text>
                  <Ionicons name="play-skip-forward" size={18} color="#fff" />
                </Focusable>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}

      {/* Salta intro/riassunto: visibile anche a controlli nascosti, come nelle app di streaming. */}
      {activeSegment && !error ? (
        <Focusable
          style={[styles.skip, { right: Math.max(insets.right, space.xl), bottom: controls ? 140 : space.xxl * 1.5 }]}
          onPress={() => seekTo(ticksToSeconds(activeSegment.EndTicks))}
          hasTVPreferredFocus={tv && !controls}>
          <Text style={styles.skipText}>{activeSegment.Type === 'Intro' ? 'Salta intro' : 'Salta riassunto'}</Text>
          <Ionicons name="play-skip-forward" size={18} color="#000" />
        </Focusable>
      ) : null}

      {!activeSegment && inOutro && !ended && !error && !controls ? (
        <Focusable style={[styles.skip, { right: Math.max(insets.right, space.xl), bottom: space.xxl * 1.5 }]} onPress={playNext} hasTVPreferredFocus={tv}>
          <Text style={styles.skipText}>Prossimo episodio</Text>
          <Ionicons name="play-skip-forward" size={18} color="#000" />
        </Focusable>
      ) : null}

      {countdown != null && nextEp ? (
        <View style={styles.nextCard}>
          <Text style={styles.nextLabel}>Prossimo episodio tra {countdown}s</Text>
          <Text style={styles.nextTitle} numberOfLines={1}>
            {itemSubtitle(nextEp).split(' · ').pop()} · {nextEp.Name}
          </Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title="Guarda ora" variant="light" onPress={playNext} hasTVPreferredFocus={tv} />
            <Button title="Annulla" variant="secondary" onPress={() => setCountdown(null)} />
          </View>
        </View>
      ) : null}

      {ended && !nextEp && !groupMode ? (
        <View style={[styles.center, { gap: space.md }]}>
          <Text style={styles.title}>Fine</Text>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Button title="Riguarda" variant="secondary" onPress={togglePlay} />
            <Button title="Chiudi" variant="light" onPress={close} hasTVPreferredFocus={tv} />
          </View>
        </View>
      ) : null}

      <TrackSheet
        visible={tracksOpen}
        onClose={() => setTracksOpen(false)}
        audio={stream?.audioStreams ?? []}
        subtitles={stream?.subtitleStreams ?? []}
        audioIndex={stream?.audioIndex}
        subtitleIndex={stream?.subtitleIndex}
        onPick={pickTrack}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  waitText: { color: '#fff', marginTop: space.md, fontSize: font.md, fontWeight: '600' },
  errorText: { color: '#fff', fontSize: font.md, textAlign: 'center', maxWidth: 520 },
  shadeTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 120, backgroundColor: 'rgba(0,0,0,0.45)' },
  shadeBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 150, backgroundColor: 'rgba(0,0,0,0.5)' },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  iconBtn: { padding: space.sm, borderRadius: radius.pill },
  title: { color: '#fff', fontSize: font.lg, fontWeight: '800' },
  subtitle: { color: 'rgba(255,255,255,0.75)', fontSize: font.sm },
  groupPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    maxWidth: 260,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  groupPillText: { color: '#fff', fontSize: font.xs, fontWeight: '700' },
  middle: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: tv ? 80 : 56 },
  roundBtn: { alignItems: 'center', justifyContent: 'center', padding: space.sm, borderRadius: 50 },
  roundLabel: { color: '#fff', fontSize: 10, fontWeight: '800', marginTop: -2 },
  playBtn: { width: tv ? 96 : 80, height: tv ? 96 : 80, borderRadius: 48, backgroundColor: 'rgba(255,255,255,0.15)' },
  bottom: { gap: 4 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', minHeight: 36 },
  method: { color: 'rgba(255,255,255,0.5)', fontSize: font.xs },
  textBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.md },
  textBtnLabel: { color: '#fff', fontWeight: '700', fontSize: font.sm },
  skip: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
  },
  skipText: { color: '#000', fontWeight: '800', fontSize: font.md },
  nextCard: {
    position: 'absolute',
    right: space.xl,
    bottom: space.xxl,
    backgroundColor: 'rgba(18,18,24,0.95)',
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
    maxWidth: 420,
  },
  nextLabel: { color: colors.textDim, fontSize: font.sm, fontWeight: '700' },
  nextTitle: { color: '#fff', fontSize: font.md, fontWeight: '800' },
});

