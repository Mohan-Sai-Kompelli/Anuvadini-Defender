import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../design/ThemeContext';
import { haptic } from '../../utils/haptics';
import type { HapticType } from '../../utils/haptics';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  /** Leading Lucide icon component, e.g. icon={MapPin} */
  icon?: LucideIcon;
  fullWidth?: boolean;
  /** Haptic fired on press. Default 'impactLight'. */
  hapticType?: HapticType;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const SIZES: Record<
  ButtonSize,
  { height: number; paddingHorizontal: number; fontSize: number; icon: number }
> = {
  sm: { height: 36, paddingHorizontal: 12, fontSize: 13, icon: 16 },
  md: { height: 48, paddingHorizontal: 16, fontSize: 14, icon: 18 },
  lg: { height: 56, paddingHorizontal: 24, fontSize: 16, icon: 20 },
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon: Icon,
  fullWidth = false,
  hapticType = 'impactLight',
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ButtonProps): React.JSX.Element {
  const { theme } = useTheme();
  const { colors, radii, durations } = theme;
  const scale = useSharedValue(1);

  const blocked = disabled || loading;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const pressIn = () => {
    scale.value = withTiming(0.97, {
      duration: durations.fast,
      reduceMotion: ReduceMotion.System,
    });
  };
  const pressOut = () => {
    scale.value = withTiming(1, {
      duration: durations.fast,
      reduceMotion: ReduceMotion.System,
    });
  };

  const handlePress = () => {
    if (blocked) {
      return;
    }
    haptic(hapticType);
    onPress();
  };

  let backgroundColor = 'transparent';
  let labelColor = colors.brand;
  let borderColor = 'transparent';
  let borderWidth = 0;
  switch (variant) {
    case 'primary':
      backgroundColor = colors.brand;
      labelColor = colors.textInverse;
      break;
    case 'secondary':
      backgroundColor = colors.brandSoft;
      labelColor = colors.brandStrong;
      break;
    case 'outline':
      borderColor = colors.brand;
      borderWidth = 1.5;
      labelColor = colors.brand;
      break;
    case 'ghost':
      labelColor = colors.brand;
      break;
    case 'danger':
      backgroundColor = colors.danger;
      labelColor = colors.textInverse;
      break;
  }

  const dims = SIZES[size];

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      disabled={blocked}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: blocked, busy: loading }}
      hitSlop={size === 'sm' ? { top: 4, bottom: 4, left: 4, right: 4 } : undefined}
      testID={testID}
      style={[
        styles.base,
        {
          height: dims.height,
          paddingHorizontal: dims.paddingHorizontal,
          borderRadius: radii.md,
          backgroundColor,
          borderColor,
          borderWidth,
          opacity: blocked ? 0.55 : 1,
        },
        fullWidth && styles.fullWidth,
        animatedStyle,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={labelColor} style={styles.leading} />
      ) : Icon ? (
        <Icon size={dims.icon} color={labelColor} style={styles.leading} />
      ) : null}
      <Text
        style={[
          styles.label,
          { color: labelColor, fontSize: dims.fontSize },
        ]}
        numberOfLines={1}
      >
        {title}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    minWidth: 44,
  },
  fullWidth: {
    alignSelf: 'stretch',
    width: '100%',
  },
  leading: {
    marginRight: 8,
  },
  label: {
    fontWeight: '600',
  },
});
