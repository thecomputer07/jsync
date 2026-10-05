import { useEffect, useRef } from 'react';
import { NativeModules, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { useT } from '@/i18n';
import { colors, font, radius, space } from '@/theme';

/**
 * Chromecast tramite react-native-google-cast. Il modulo nativo esiste solo nelle build
 * dell'app (non in Expo Go): se manca, tutto questo file resta inerte.
 */
export const castAvailable = !!NativeModules.RNGCCastContext;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const GC: typeof import('react-native-google-cast') | null = castAvailable ? require('react-native-google-cast') : null;

export interface CastMedia {
  uri: string;
  contentType: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  startSeconds: number;
}

export function CastButton({ tint = '#fff', size = 26 }: { tint?: string; size?: number }) {
  if (!GC) return null;
  const B = GC.CastButton;
  return <B style={{ width: size + 8, height: size + 8, tintColor: tint }} />;
}

/**
 * Quando c'è una sessione Cast attiva manda il video al dispositivo e lo segnala al player
 * (che mette in pausa la riproduzione sul telefono).
 */
export function CastController(props: {
  media: CastMedia | null;
  onCastingChange: (casting: boolean) => void;
}) {
  if (!GC) return null;
  return <CastControllerInner {...props} />;
}

function CastControllerInner({ media, onCastingChange }: { media: CastMedia | null; onCastingChange: (c: boolean) => void }) {
  const { t } = useT();
  const client = GC!.useRemoteMediaClient();
  const device = GC!.useCastDevice();
  const loaded = useRef<string | null>(null);

  useEffect(() => {
    onCastingChange(!!client);
    if (!client) loaded.current = null;
  }, [client]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!client || !media || loaded.current === media.uri) return;
    loaded.current = media.uri;
    client
      .loadMedia({
        autoplay: true,
        startTime: media.startSeconds,
        mediaInfo: {
          contentUrl: media.uri,
          contentType: media.contentType,
          metadata: {
            type: 'movie',
            title: media.title,
            subtitle: media.subtitle,
            images: media.imageUrl ? [{ url: media.imageUrl }] : [],
          },
        },
      })
      .catch(() => {
        loaded.current = null;
      });
  }, [client, media]);

  if (!client) return null;
  return (
    <View style={styles.banner}>
      <Text style={styles.text} numberOfLines={1}>
        {t('player.casting', { device: device?.friendlyName ?? 'Chromecast' })}
      </Text>
      <Button
        title={t('player.castStop')}
        variant="secondary"
        onPress={() => GC!.default.getSessionManager().endCurrentSession(true).catch(() => {})}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    alignSelf: 'center',
    top: '38%',
    backgroundColor: 'rgba(18,18,24,0.95)',
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
    alignItems: 'center',
    maxWidth: 420,
    borderColor: colors.border,
    borderWidth: 1,
  },
  text: { color: '#fff', fontSize: font.md, fontWeight: '800' },
});
