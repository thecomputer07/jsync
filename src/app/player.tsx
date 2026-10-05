import { Ionicons } from '@expo/vector-icons';
import { useEventListener } from 'expo';
import * as Brightness from 'expo-brightness';
import { useKeepAwake } from 'expo-keep-awake';
import * as NavigationBar from 'expo-navigation-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { VideoAirPlayButton, VideoView, useVideoPlayer } from 'expo-video';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Focusable } from '@/components/focusable';
import { CastButton, CastController, castAvailable, type CastMedia } from '@/components/player/cast';
import { GestureLayer, type Side } from '@/components/player/gestures';
import { SeekBar } from '@/components/player/seek-bar';
import { OptionsSheet, TrackSheet } from '@/components/player/track-sheet';
import { TrickplayThumb } from '@/components/player/trickplay';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui';
import { useT } from '@/i18n';
import { itemSubtitle, secondsToTicks, ticksToSeconds } from '@/lib/jellyfin/client';
import { resolveStream, type ResolvedStream } from '@/lib/jellyfin/playback';
import type { BaseItem, MediaSegment, MediaStream, TrickplayInfo } from '@/lib/jellyfin/types';
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
  const { t } = useT();
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
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [quality, setQuality] = useState(0); // 0 = dalle impostazioni
  const [trickplay, setTrickplay] = useState<TrickplayInfo | null>(null);
  const [adjust, setAdjust] = useState<{ kind: 'brightness' | 'volume'; value: number } | null>(null);
  const [bubble, setBubble] = useState<{ side: Side; seconds: number; key: number } | null>(null);
  const [casting, setCasting] = useState(false);
  const [castMedia, setCastMedia] = useState<CastMedia | null>(null);
  const videoRef = useRef<VideoView>(null);

  const player = useVideoPlayer(null, (p) => {
    p.timeUpdateEventInterval = 0.25;
    p.keepScreenOnWhilePlaying = true;
    p.staysActiveInBackground = false;
    // Titolo e controlli sulla schermata di blocco / centro di controllo (solo nell'app installata).
    p.showNowPlayingNotification = true;
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
    quality: 0,
    speed: 1,
    brightness: null as number | null,
    bubbleTimer: null as ReturnType<typeof setTimeout> | null,
    adjustTimer: null as ReturnType<typeof setTimeout> | null,
  }).current;

  // ── orientamento, barre di sistema, stato globale ──
  useEffect(() => {
    playerState.mounted = true;
    lockPlayerOrientation();
    if (Platform.OS === 'android' && !tv) NavigationBar.setVisibilityAsync('hidden').catch(() => {});
    Brightness.getBrightnessAsync()
      .then((b) => {
        r.brightness = b;
      })
      .catch(() => {});
    return () => {
      playerState.mounted = false;
      lockAppOrientation();
      // la luminosità cambiata col gesto vale solo nel player
      if (Platform.OS === 'android') Brightness.restoreSystemBrightnessAsync().catch(() => {});
      else if (r.brightness != null) Brightness.setBrightnessAsync(r.brightness).catch(() => {});
      if (Platform.OS === 'android' && !tv) NavigationBar.setVisibilityAsync('visible').catch(() => {});
    };
  }, [r]);

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
          maxBitrate: r.quality || settings.maxBitrate,
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

        // Segmenti, anteprime della barra e prossimo episodio, in parallelo.
        c.segments(itemId).then((seg) => token === r.loadToken && setSegments(seg));
        c.trickplay(itemId).then((tp) => token === r.loadToken && setTrickplay(tp));
        if (it.Type === 'Episode' && it.SeriesId) {
          c.episodes(it.SeriesId, undefined, it.Id, 2)
            .then((res) => token === r.loadToken && setNextEp(res.Items[1] ?? null))
            .catch(() => {});
        } else setNextEp(null);
      } catch (e: any) {
        if (token !== r.loadToken) return;
        setError(e?.message ?? t('player.cannotPlay'));
        setLoading(false);
      }
    },
    [c, player, r, settings, stopReporting, t],
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
          if (r.speed !== 1) player.playbackRate = r.speed;
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
      setError(err?.message ? t('player.playErrorMsg', { msg: err.message }) : t('player.playError'));
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

  function autoSkip(time: number) {
    if (groupMode) return; // in gruppo si salta a mano: un seek per tutti, non uno per persona
    for (const s of segments) {
      const auto = (s.Type === 'Intro' && settings.autoSkipIntro) || (s.Type === 'Recap' && settings.autoSkipRecap);
      if (!auto) continue;
      const key = `${s.Type}:${s.StartTicks}`;
      const a = ticksToSeconds(s.StartTicks);
      const b = ticksToSeconds(s.EndTicks);
      if (time >= a && time < b - 1 && !r.skipped.has(key)) {
        r.skipped.add(key);
        player.currentTime = b;
        toast(s.Type === 'Intro' ? t('player.introSkipped') : t('player.recapSkipped'));
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

  const changeSpeed = (v: number) => {
    setOptionsOpen(false);
    if (groupMode) return;
    r.speed = v;
    setSpeed(v);
    safe(() => {
      player.playbackRate = v;
    }, undefined);
  };

  const changeQuality = (q: number) => {
    setOptionsOpen(false);
    if (q === r.quality) return;
    r.quality = q;
    setQuality(q);
    const s = r.stream;
    const it = r.item;
    if (!it) return;
    if (groupMode) syncplay?.onLocalReload();
    load(it.Id, r.pos, { audio: s?.audioIndex, subtitle: s?.subtitleIndex });
  };

  const onDoubleTap = (side: Side) => {
    const d = side === 'left' ? -10 : 10;
    skipBy(d);
    setBubble((b) => ({ side, seconds: b && b.side === side ? b.seconds + d : d, key: Date.now() }));
    if (r.bubbleTimer) clearTimeout(r.bubbleTimer);
    r.bubbleTimer = setTimeout(() => setBubble(null), 700);
  };

  const onAdjust = (side: Side, delta: number) => {
    const kind = side === 'left' ? 'brightness' : 'volume';
    if (r.adjustTimer) clearTimeout(r.adjustTimer);
    setAdjust((a) => {
      const base = a && a.kind === kind ? a.value : kind === 'volume' ? safe(() => player.volume, 1) : (r.brightness ?? 0.5);
      const value = Math.min(1, Math.max(0, base + delta));
      if (kind === 'volume') {
        safe(() => {
          player.volume = value;
        }, undefined);
      } else {
        Brightness.setBrightnessAsync(value).catch(() => {});
      }
      return { kind, value };
    });
  };

  const onAdjustEnd = () => {
    if (r.adjustTimer) clearTimeout(r.adjustTimer);
    r.adjustTimer = setTimeout(() => setAdjust(null), 600);
  };

  const startPip = () => {
    try {
      videoRef.current?.startPictureInPicture();
    } catch {
      toast(t('player.pipUnavailable'));
    }
  };

  // Chromecast: si chiede al server uno stream compatibile e lo si manda al dispositivo.
  const onCastingChange = (on: boolean) => {
    setCasting(on);
    if (!on) {
      setCastMedia(null);
      return;
    }
    safe(() => player.pause(), undefined);
    const it = r.item;
    if (!it) return;
    resolveStream(c, it.Id, {
      startTicks: secondsToTicks(r.pos),
      audioIndex: r.stream?.audioIndex,
      subtitleIndex: r.stream?.subtitleIndex,
      maxBitrate: 20_000_000,
      burnSubtitles: true,
      cast: true,
    })
      .then((cs) =>
        setCastMedia({
          uri: cs.uri,
          contentType: cs.contentType === 'hls' ? 'application/x-mpegURL' : 'video/mp4',
          title: it.Type === 'Episode' ? `${it.SeriesName} · ${it.Name}` : it.Name,
          subtitle: itemSubtitle(it),
          imageUrl: c.imageUrl(it.Type === 'Episode' ? it.SeriesId : it.Id, 'Primary', { width: 600 }),
          startSeconds: r.pos,
        }),
      )
      .catch((e) => toast(e?.message ?? t('player.cannotPlay'), 'error'));
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
    if (!evt || tracksOpen || optionsOpen) return;
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
      if (tracksOpen || optionsOpen) {
        setTracksOpen(false);
        setOptionsOpen(false);
        return true;
      }
      if (tv && controls && player.playing) {
        setControls(false);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [tracksOpen, optionsOpen, controls, player]);

  const close = () => router.back();

  const waiting = groupMode && sp.state === 'Waiting';
  const title = item ? (item.Type === 'Episode' ? item.Name : item.Name) : '';
  const subtitle = item?.Type === 'Episode' ? itemSubtitle(item) : item?.ProductionYear ? String(item.ProductionYear) : '';

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <VideoView
        ref={videoRef}
        player={player}
        style={StyleSheet.absoluteFill}
        nativeControls={false}
        contentFit="contain"
        allowsPictureInPicture={!groupMode}
        startsPictureInPictureAutomatically={!groupMode}
      />

      {tv ? (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => (controls ? setControls(false) : showControls())} focusable={false} />
      ) : (
        <GestureLayer
          enabled={!error && !tracksOpen && !optionsOpen}
          onTap={() => (controls ? setControls(false) : showControls())}
          onDoubleTap={onDoubleTap}
          onAdjust={onAdjust}
          onAdjustEnd={onAdjustEnd}
        />
      )}

      {bubble ? (
        <View pointerEvents="none" style={[styles.bubble, bubble.side === 'left' ? { left: '12%' } : { right: '12%' }]}>
          <Ionicons name={bubble.side === 'left' ? 'play-back' : 'play-forward'} size={26} color="#fff" />
          <Text style={styles.bubbleText}>
            {bubble.seconds > 0 ? '+' : ''}
            {bubble.seconds}s
          </Text>
        </View>
      ) : null}

      {adjust ? (
        <View pointerEvents="none" style={styles.adjust}>
          <Ionicons name={adjust.kind === 'volume' ? (adjust.value === 0 ? 'volume-mute' : 'volume-high') : 'sunny'} size={22} color="#fff" />
          <View style={styles.adjustTrack}>
            <View style={[styles.adjustFill, { width: `${Math.round(adjust.value * 100)}%` }]} />
          </View>
          <Text style={styles.adjustText}>{Math.round(adjust.value * 100)}%</Text>
        </View>
      ) : null}

      {(loading || waiting) && !error ? (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator size="large" color="#fff" />
          {waiting ? <Text style={styles.waitText}>{t('player.waiting')}</Text> : null}
        </View>
      ) : null}

      {error ? (
        <View style={[styles.center, { gap: space.lg, padding: space.xl, backgroundColor: 'rgba(0,0,0,0.75)' }]}>
          <Text style={styles.errorText}>{error}</Text>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            {target ? <Button title={t('common.retry')} variant="secondary" onPress={() => load(target.itemId, position)} hasTVPreferredFocus={tv} /> : null}
            <Button title={t('common.close')} variant="ghost" onPress={close} />
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
            {Platform.OS === 'ios' && !groupMode ? (
              <VideoAirPlayButton style={styles.airplay} tint="#fff" activeTint={colors.accent} />
            ) : null}
            {castAvailable && !groupMode ? <CastButton /> : null}
            {!tv && !groupMode ? (
              <Focusable onPress={startPip} style={styles.iconBtn} zoom={false} accessibilityLabel={t('player.pip')}>
                <Ionicons name="albums-outline" size={23} color="#fff" />
              </Focusable>
            ) : null}
            <Focusable onPress={() => setTracksOpen(true)} style={styles.iconBtn} zoom={false} accessibilityLabel={t('player.subtitles')}>
              <Ionicons name="chatbox-ellipses-outline" size={24} color="#fff" />
            </Focusable>
            <Focusable onPress={() => setOptionsOpen(true)} style={styles.iconBtn} zoom={false} accessibilityLabel={t('player.options')}>
              <Ionicons name="options-outline" size={24} color="#fff" />
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
              onScrubEnd={scheduleHide}
              renderPreview={(sec) => <TrickplayThumb client={c} tp={trickplay} seconds={sec} width={tv ? 260 : 176} />}
            />
            <View style={styles.bottomRow}>
              {stream ? (
                <Text style={styles.method}>
                  {stream.playMethod === 'DirectPlay' ? t('player.direct') : stream.playMethod === 'DirectStream' ? t('player.remux') : t('player.transcode')}
                  {speed !== 1 ? `  ·  ${speed}×` : ''}
                </Text>
              ) : null}
              <View style={{ flex: 1 }} />
              {nextEp ? (
                <Focusable onPress={playNext} style={styles.textBtn} zoom={false}>
                  <Text style={styles.textBtnLabel}>{t('player.nextEpisode')}</Text>
                  <Ionicons name="play-skip-forward" size={18} color="#fff" />
                </Focusable>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}

      {/* Sincronizzazione col gruppo: sempre visibile in gruppo, anche a controlli nascosti. */}
      {groupMode && sp.group && !error ? (
        <View pointerEvents="none" style={[styles.syncBadge, { top: Math.max(insets.top, space.md) + (controls ? 52 : 0), right: Math.max(insets.right, space.lg) }]}>
          <SyncBadge measuring={sp.measuring} diffMs={sp.diffMs} syncing={sp.syncing} state={sp.state} ping={syncplay?.time.ping ?? 0} />
        </View>
      ) : null}

      {/* Salta intro/riassunto: visibile anche a controlli nascosti, come nelle app di streaming. */}
      {activeSegment && !error ? (
        <Focusable
          style={[styles.skip, { right: Math.max(insets.right, space.xl), bottom: controls ? 140 : space.xxl * 1.5 }]}
          onPress={() => seekTo(ticksToSeconds(activeSegment.EndTicks))}
          hasTVPreferredFocus={tv && !controls}>
          <Text style={styles.skipText}>{activeSegment.Type === 'Intro' ? t('player.skipIntro') : t('player.skipRecap')}</Text>
          <Ionicons name="play-skip-forward" size={18} color="#000" />
        </Focusable>
      ) : null}

      {!activeSegment && inOutro && !ended && !error && !controls ? (
        <Focusable style={[styles.skip, { right: Math.max(insets.right, space.xl), bottom: space.xxl * 1.5 }]} onPress={playNext} hasTVPreferredFocus={tv}>
          <Text style={styles.skipText}>{t('player.nextEpisode')}</Text>
          <Ionicons name="play-skip-forward" size={18} color="#000" />
        </Focusable>
      ) : null}

      {countdown != null && nextEp ? (
        <View style={styles.nextCard}>
          <Text style={styles.nextLabel}>{t('player.nextIn', { s: countdown })}</Text>
          <Text style={styles.nextTitle} numberOfLines={1}>
            {itemSubtitle(nextEp).split(' · ').pop()} · {nextEp.Name}
          </Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title={t('player.watchNow')} variant="light" onPress={playNext} hasTVPreferredFocus={tv} />
            <Button title={t('common.cancel')} variant="secondary" onPress={() => setCountdown(null)} />
          </View>
        </View>
      ) : null}

      {ended && !nextEp && !groupMode ? (
        <View style={[styles.center, { gap: space.md }]}>
          <Text style={styles.title}>{t('player.end')}</Text>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Button title={t('player.rewatch')} variant="secondary" onPress={togglePlay} />
            <Button title={t('common.close')} variant="light" onPress={close} hasTVPreferredFocus={tv} />
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
      <OptionsSheet
        visible={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        speed={speed}
        onSpeed={changeSpeed}
        speedLocked={groupMode}
        quality={quality}
        onQuality={changeQuality}
      />
      {!groupMode ? <CastController media={casting ? castMedia : null} onCastingChange={onCastingChange} /> : null}
    </View>
  );
}

/**
 * Quanto questo dispositivo è lontano dalla linea temporale del gruppo (stimata dal server).
 * Ogni client JSync si allinea al server, non agli altri: se qui resti a pochi ms, sei in sync con tutti.
 */
function SyncBadge({ measuring, diffMs, syncing, state, ping }: { measuring: boolean; diffMs: number; syncing: string | null; state: string | null; ping: number }) {
  const { t } = useT();
  const abs = Math.abs(diffMs);
  const color = !measuring ? 'rgba(255,255,255,0.6)' : abs < 100 ? colors.success : abs < 500 ? '#FACC15' : colors.danger;
  const label = !measuring
    ? state === 'Waiting'
      ? t('player.syncWaiting')
      : state === 'Paused'
        ? t('player.syncPaused')
        : t('player.syncing')
    : diffMs > 0
      ? t('player.behind', { ms: abs })
      : t('player.ahead', { ms: abs });
  return (
    <View style={styles.syncInner}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.syncText}>
        {label}
        {syncing ? `  ${syncing}` : ''}
        {ping ? `  · ping ${Math.round(ping)} ms` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  airplay: { width: 34, height: 34 },
  bubble: {
    position: 'absolute',
    top: '42%',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 40,
  },
  bubbleText: { color: '#fff', fontWeight: '800', fontSize: font.sm },
  adjust: {
    position: 'absolute',
    top: '18%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
  },
  adjustTrack: { width: 140, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  adjustFill: { height: 5, backgroundColor: '#fff' },
  adjustText: { color: '#fff', fontWeight: '700', fontSize: 12, minWidth: 36, fontVariant: ['tabular-nums'] },
  syncBadge: { position: 'absolute' },
  syncInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  syncText: { color: '#fff', fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
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

