import React, { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { StyleProp, TextInputProps, TextStyle, ViewStyle } from 'react-native';
import Animated, {
  ReduceMotion,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Eye, EyeOff } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../design/ThemeContext';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  /** Leading Lucide icon component, e.g. icon={Mail} */
  icon?: LucideIcon;
  /** Error message shown below the field (also turns the border red) */
  error?: string;
  helperText?: string;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    icon: Icon,
    error,
    helperText,
    containerStyle,
    inputStyle,
    secureTextEntry,
    onFocus,
    onBlur,
    editable = true,
    ...rest
  },
  ref,
): React.JSX.Element {
  const { theme } = useTheme();
  const { colors, radii, spacing, typography, durations } = theme;
  const [hidden, setHidden] = useState(secureTextEntry === true);
  const focus = useSharedValue(0);

  const borderBase = colors.border;
  const borderFocused = colors.brand;
  const animatedBorder = useAnimatedStyle(() => ({
    borderColor: error
      ? colors.danger
      : interpolateColor(focus.value, [0, 1], [borderBase, borderFocused]),
  }));

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text style={[typography.bodyBold, styles.label, { color: colors.text }]}>
          {label}
        </Text>
      ) : null}
      <Animated.View
        style={[
          styles.field,
          {
            backgroundColor: editable ? colors.surface : colors.surfaceAlt,
            borderRadius: radii.md,
          },
          animatedBorder,
        ]}
      >
        {Icon ? (
          <Icon
            size={18}
            color={error ? colors.danger : colors.textMuted}
            style={styles.leadingIcon}
          />
        ) : null}
        <TextInput
          ref={ref}
          {...rest}
          editable={editable}
          secureTextEntry={hidden}
          onFocus={e => {
            focus.value = withTiming(1, {
              duration: durations.fast,
              reduceMotion: ReduceMotion.System,
            });
            onFocus?.(e);
          }}
          onBlur={e => {
            focus.value = withTiming(0, {
              duration: durations.fast,
              reduceMotion: ReduceMotion.System,
            });
            onBlur?.(e);
          }}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={rest.accessibilityLabel ?? label}
          style={[
            styles.input,
            { color: colors.text, paddingHorizontal: spacing.md },
            inputStyle,
          ]}
        />
        {secureTextEntry ? (
          <Pressable
            onPress={() => setHidden(prev => !prev)}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.eyeButton}
          >
            {hidden ? (
              <Eye size={18} color={colors.textMuted} />
            ) : (
              <EyeOff size={18} color={colors.textMuted} />
            )}
          </Pressable>
        ) : null}
      </Animated.View>
      {error ? (
        <Text
          style={[typography.caption, styles.helper, { color: colors.danger }]}
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      ) : helperText ? (
        <Text
          style={[typography.caption, styles.helper, { color: colors.textMuted }]}
        >
          {helperText}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    marginBottom: 6,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    minHeight: 48,
  },
  leadingIcon: {
    marginLeft: 12,
  },
  input: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 12,
  },
  eyeButton: {
    paddingHorizontal: 12,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helper: {
    marginTop: 4,
  },
});
