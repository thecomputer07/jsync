import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { forwardRef } from 'react';

import { colors, font, gradient, radius, space, tv } from '@/theme';
import { Focusable } from './focusable';

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  style,
  hasTVPreferredFocus,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'light';
  icon?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  hasTVPreferredFocus?: boolean;
}) {
  const content = (
    <View style={styles.btnInner}>
      {loading ? (
        <ActivityIndicator color={variant === 'light' ? '#000' : colors.text} />
      ) : (
        <>
          {icon}
          <Text
            style={[
              styles.btnText,
              variant === 'light' && { color: '#000' },
              variant === 'ghost' && { color: colors.textDim },
            ]}
            numberOfLines={1}>
            {title}
          </Text>
        </>
      )}
    </View>
  );
  return (
    <Focusable
      onPress={onPress}
      disabled={disabled || loading}
      hasTVPreferredFocus={hasTVPreferredFocus}
      zoom={false}
      style={[
        styles.btn,
        variant === 'secondary' && { backgroundColor: 'rgba(255,255,255,0.14)' },
        variant === 'ghost' && { backgroundColor: 'transparent' },
        variant === 'danger' && { backgroundColor: 'rgba(244,63,94,0.18)' },
        variant === 'light' && { backgroundColor: '#fff' },
        disabled && { opacity: 0.45 },
        style,
      ]}>
      {variant === 'primary' ? (
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btnGrad}>
          {content}
        </LinearGradient>
      ) : (
        content
      )}
    </Focusable>
  );
}

export const Input = forwardRef<TextInput, TextInputProps & { label?: string }>(function Input(
  { label, style, ...rest },
  ref,
) {
  return (
    <View style={{ gap: space.xs }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textMute}
        selectionColor={colors.accent}
        autoCorrect={false}
        {...rest}
        style={[styles.input, style]}
      />
    </View>
  );
});

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.accent} size="large" />
      {label ? <Text style={[styles.dim, { marginTop: space.md }]}>{label}</Text> : null}
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={[styles.center, { padding: space.xl, gap: space.lg }]}>
      <Text style={[styles.dim, { textAlign: 'center' }]}>{message}</Text>
      {onRetry ? <Button title="Riprova" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

export function ProgressBar({ value, style }: { value: number; style?: ViewStyle }) {
  return (
    <View style={[styles.track, style]}>
      <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, value))}%` }]} />
    </View>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.section}>{children}</Text>;
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    overflow: 'hidden',
    minHeight: tv ? 64 : 48,
    justifyContent: 'center',
  },
  btnGrad: { flex: 1, justifyContent: 'center', minHeight: tv ? 64 : 48 },
  btnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  btnText: { color: colors.text, fontSize: font.md, fontWeight: '700' },
  label: { color: colors.textDim, fontSize: font.sm, fontWeight: '600' },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: font.md,
    paddingHorizontal: space.lg,
    paddingVertical: tv ? space.lg : space.md,
    minHeight: tv ? 64 : 48,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  dim: { color: colors.textDim, fontSize: font.md },
  track: { height: 4, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: colors.accent },
  section: {
    color: colors.text,
    fontSize: font.lg,
    fontWeight: '800',
    marginBottom: space.sm,
    paddingHorizontal: space.lg,
  },
});

export const ui = styles;
