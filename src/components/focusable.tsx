import { forwardRef, useState } from 'react';
import { Platform, Pressable, type PressableProps, type StyleProp, type View, type ViewStyle } from 'react-native';

import { colors, radius } from '@/theme';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  focusStyle?: StyleProp<ViewStyle>;
  /** Ingrandisce leggermente quando ha il focus (TV) — come Netflix. */
  zoom?: boolean;
  children?: React.ReactNode | ((s: { focused: boolean; pressed: boolean }) => React.ReactNode);
};

/**
 * Pressable che sulla TV mostra il focus del telecomando (bordo + zoom),
 * e sul telefono dà solo il feedback alla pressione.
 */
export const Focusable = forwardRef<View, Props>(function Focusable(
  { style, focusStyle, zoom = true, children, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      ref={ref}
      {...rest}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={({ pressed }) => [
        style,
        pressed && !Platform.isTV && { opacity: 0.75 },
        focused && {
          borderColor: colors.text,
          borderWidth: 3,
          borderRadius: radius.md,
          ...(zoom ? { transform: [{ scale: 1.06 }] } : null),
        },
        focused && focusStyle,
      ]}>
      {(s) => (typeof children === 'function' ? children({ focused, pressed: s.pressed }) : children)}
    </Pressable>
  );
});
