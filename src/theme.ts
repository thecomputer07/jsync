import { Platform } from 'react-native';

export const colors = {
  bg: '#07070A',
  surface: '#121218',
  surfaceHi: '#1C1C25',
  border: '#2A2A36',
  text: '#F4F4F8',
  textDim: '#A3A3B5',
  textMute: '#6B6B7E',
  accent: '#8B5CF6',
  accent2: '#EC4899',
  danger: '#F43F5E',
  success: '#22C55E',
  overlay: 'rgba(0,0,0,0.55)',
};

export const gradient = [colors.accent, colors.accent2] as const;

/** Sulla TV si guarda da 3 metri: tutto più grande. */
export const tv = Platform.isTV;
export const scale = (n: number) => (tv ? Math.round(n * 1.5) : n);

export const space = {
  xs: scale(4),
  sm: scale(8),
  md: scale(12),
  lg: scale(16),
  xl: scale(24),
  xxl: scale(32),
};

export const radius = { sm: 6, md: 10, lg: 16, pill: 999 };

export const font = {
  xs: scale(11),
  sm: scale(13),
  md: scale(15),
  lg: scale(18),
  xl: scale(22),
  xxl: scale(30),
  hero: scale(36),
};
