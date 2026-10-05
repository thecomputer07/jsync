import { Platform } from 'react-native';

import { JellyfinClient } from './client';
import type { MediaSource, MediaStream } from './types';

/**
 * Cosa il player nativo sa riprodurre senza aiuto del server.
 * - iOS (AVPlayer): niente MKV, niente Opus/Vorbis → il server rimuxa in HLS (costo quasi nullo).
 * - Android (ExoPlayer): legge MKV; AC3/EAC3 solo sulle TV (i telefoni di solito non hanno il decoder).
 * Quello che non è in lista lo converte Jellyfin.
 */
export function buildDeviceProfile(opts: { maxBitrate: number; burnSubtitles: boolean }) {
  const ios = Platform.OS === 'ios';
  const tv = Platform.isTV;

  const videoCodecs = ios ? 'h264,hevc' : 'h264,hevc,vp9,av1';
  const audioCodecs = ios
    ? 'aac,mp3,ac3,eac3,alac,flac'
    : tv
      ? 'aac,mp3,ac3,eac3,opus,flac,vorbis'
      : 'aac,mp3,opus,flac,vorbis';

  const directPlay = ios
    ? [{ Container: 'mp4,m4v,mov', Type: 'Video', VideoCodec: videoCodecs, AudioCodec: audioCodecs }]
    : [{ Container: 'mp4,m4v,mkv,webm,mov', Type: 'Video', VideoCodec: videoCodecs, AudioCodec: audioCodecs }];

  const text = ['srt', 'subrip', 'ass', 'ssa', 'vtt', 'webvtt', 'mov_text'];
  const image = ['pgssub', 'pgs', 'dvdsub', 'dvbsub', 'vobsub'];
  const subtitleProfiles = opts.burnSubtitles
    ? [...text, ...image].map((Format) => ({ Format, Method: 'Encode' }))
    : [
        ...text.map((Format) => ({ Format, Method: 'Hls' })),
        ...image.map((Format) => ({ Format, Method: 'Encode' })),
      ];

  return {
    Name: `Rave ${Platform.OS}${tv ? ' TV' : ''}`,
    MaxStreamingBitrate: opts.maxBitrate,
    MaxStaticBitrate: opts.maxBitrate,
    MusicStreamingTranscodingBitrate: 384000,
    DirectPlayProfiles: directPlay,
    TranscodingProfiles: [
      {
        Container: 'mp4',
        Type: 'Video',
        VideoCodec: ios ? 'h264,hevc' : 'h264,hevc',
        AudioCodec: ios ? 'aac,ac3,eac3' : tv ? 'aac,ac3,eac3' : 'aac',
        Context: 'Streaming',
        Protocol: 'hls',
        MaxAudioChannels: tv ? '6' : '2',
        MinSegments: 2,
        BreakOnNonKeyFrames: true,
      },
    ],
    ContainerProfiles: [],
    CodecProfiles: [],
    SubtitleProfiles: subtitleProfiles,
  };
}

export type PlayMethod = 'DirectPlay' | 'DirectStream' | 'Transcode';

export interface ResolvedStream {
  uri: string;
  contentType: 'hls' | 'progressive';
  playMethod: PlayMethod;
  mediaSource: MediaSource;
  playSessionId: string;
  audioStreams: MediaStream[];
  subtitleStreams: MediaStream[];
  audioIndex?: number;
  subtitleIndex?: number;
}

/**
 * Chiede al server come riprodurre l'elemento e costruisce l'URL.
 * I sottotitoli scelti obbligano a passare dall'HLS del server (sono dentro la playlist):
 * il player nativo così li mostra senza file esterni.
 */
export async function resolveStream(
  client: JellyfinClient,
  itemId: string,
  opts: {
    startTicks?: number;
    audioIndex?: number;
    subtitleIndex?: number; // -1 = nessuno
    maxBitrate: number;
    burnSubtitles: boolean;
    mediaSourceId?: string;
  },
): Promise<ResolvedStream> {
  const ask = async (subtitleIndex: number | undefined) => {
    const wants = subtitleIndex != null && subtitleIndex >= 0;
    const r = await client.playbackInfo(itemId, {
      DeviceProfile: buildDeviceProfile({ maxBitrate: opts.maxBitrate, burnSubtitles: opts.burnSubtitles }),
      StartTimeTicks: opts.startTicks ?? 0,
      AudioStreamIndex: opts.audioIndex,
      SubtitleStreamIndex: subtitleIndex,
      MaxStreamingBitrate: opts.maxBitrate,
      MediaSourceId: opts.mediaSourceId,
      // Con sottotitoli attivi vogliamo l'HLS del server (rimux, non transcodifica se possibile).
      EnableDirectPlay: !wants,
    });
    if (r.ErrorCode) {
      throw new Error(
        r.ErrorCode === 'NotAllowed'
          ? 'Il tuo account non può riprodurre questo contenuto.'
          : `Il server non può riprodurre questo file (${r.ErrorCode}).`,
      );
    }
    return r;
  };

  // Nessuna scelta esplicita: decide il server in base alle preferenze dell'utente Jellyfin.
  // Se la sua scelta prevede sottotitoli, rifacciamo la richiesta per averli dentro l'HLS.
  let chosenSub = opts.subtitleIndex;
  let info = await ask(chosenSub);
  if (chosenSub === undefined) {
    const def = info.MediaSources?.[0]?.DefaultSubtitleStreamIndex ?? -1;
    chosenSub = def;
    if (def >= 0) info = await ask(def);
  }
  const wantsSubs = chosenSub != null && chosenSub >= 0;
  const ms = info.MediaSources?.[0];
  if (!ms) throw new Error('Nessuna sorgente riproducibile.');

  const streams = ms.MediaStreams ?? [];
  const audioStreams = streams.filter((s) => s.Type === 'Audio');
  const subtitleStreams = streams.filter((s) => s.Type === 'Subtitle');
  const audioIndex = opts.audioIndex ?? ms.DefaultAudioStreamIndex ?? audioStreams[0]?.Index;
  const subtitleIndex = chosenSub ?? -1;

  let uri: string;
  let playMethod: PlayMethod;
  let contentType: 'hls' | 'progressive';

  if (ms.SupportsDirectPlay && !wantsSubs && !ms.TranscodingUrl) {
    playMethod = 'DirectPlay';
    contentType = 'progressive';
    const ext = (ms.Container ?? 'mp4').split(',')[0];
    uri = client.url(`/Videos/${itemId}/stream.${ext}`, {
      static: true,
      mediaSourceId: ms.Id,
      deviceId: client.deviceId,
      playSessionId: info.PlaySessionId,
      ...client.tokenQuery(),
    });
  } else if (ms.TranscodingUrl) {
    // Solo il contenitore cambia (remux) se il server dice che può fare direct stream.
    playMethod = ms.SupportsDirectStream ? 'DirectStream' : 'Transcode';
    contentType = ms.TranscodingSubProtocol === 'hls' || /\.m3u8/i.test(ms.TranscodingUrl) ? 'hls' : 'progressive';
    uri = client.baseUrl + ms.TranscodingUrl;
    if (!/[?&](api_key|ApiKey)=/i.test(uri)) {
      const t = encodeURIComponent(client.token ?? '');
      uri += `${uri.includes('?') ? '&' : '?'}ApiKey=${t}&api_key=${t}`;
    }
  } else {
    throw new Error('Il server non offre un modo per riprodurre questo file su questo dispositivo.');
  }

  return {
    uri,
    contentType,
    playMethod,
    mediaSource: ms,
    playSessionId: info.PlaySessionId,
    audioStreams,
    subtitleStreams,
    audioIndex,
    subtitleIndex,
  };
}

export function streamLabel(s: MediaStream) {
  return s.DisplayTitle || [s.Language?.toUpperCase(), s.Codec?.toUpperCase()].filter(Boolean).join(' · ') || `Traccia ${s.Index}`;
}
