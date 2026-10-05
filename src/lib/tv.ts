import * as RN from 'react-native';

/** Evento del telecomando (sottoinsieme di HWEvent di react-native-tvos). */
export interface TVKeyEvent {
  eventType: string;
  eventKeyAction?: number;
}

type Handler = (evt: TVKeyEvent) => void;

/**
 * useTVEventHandler esiste solo nel fork react-native-tvos (build TV).
 * Su telefono ed Expo Go c'è React Native standard: lì è un hook vuoto.
 */
export const useTVEventHandler: (handler: Handler) => void =
  ((RN as unknown as { useTVEventHandler?: (h: Handler) => void }).useTVEventHandler) ?? (() => {});
