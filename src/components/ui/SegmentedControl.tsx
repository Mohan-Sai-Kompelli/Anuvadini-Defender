import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../design/ThemeContext';
import { haptic } from '../../utils/haptics';

export interface SegmentedControlProps {
  /** Segment labels, e.g. ['Leave', 'WFH'] */
  options: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  activeColors?: Array<{ bg: string; border?: string; text: string }>;
}

const PADDING = 4;

export function SegmentedControl({
  options,
  selectedIndex,
  onChange,
  disabled = false,
  style,
  activeColors,
}: SegmentedControlProps): React.JSX.Element {
  const { theme } = useTheme();
  const { colors, radii, durations, shadows } = theme;
  const [width, setWidth] = useState(0);

  const count = Math.max(options.length, 1);
  const segmentWidth = width > 0 ? (width - PADDING * 2) / count : 0;

  const offset = useSharedValue(0);
  useEffect(() => {
    offset.value = withTiming(selectedIndex * segmentWidth, {
      duration: durations.normal,
      reduceMotion: ReduceMotion.System,
    });
  }, [selectedIndex, segmentWidth, offset, durations.normal]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  };

  const select = (index: number) => {
    if (disabled || index === selectedIndex) {
      return;
    }
    haptic('selection');
    onChange(index);
  };

  const activeColorObj = activeColors && activeColors[selectedIndex];

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.track,
        {
          backgroundColor: colors.surfaceAlt,
          borderRadius: radii.md,
          borderColor: colors.border,
          borderWidth: 1,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
      accessibilityRole="tablist"
    >
      {segmentWidth > 0 ? (
        <Animated.View
          style={[
            styles.thumb,
            shadows.e1,
            {
              width: segmentWidth,
              backgroundColor: activeColorObj?.bg || colors.surface,
              borderColor: activeColorObj?.border || 'transparent',
              borderWidth: activeColorObj?.border ? 1 : 0,
              borderRadius: radii.sm,
            },
            thumbStyle,
          ]}
        />
      ) : null}
      {options.map((option, index) => {
        const selected = index === selectedIndex;
        const colorForThisIndex = activeColors && activeColors[index];
        return (
          <Pressable
            key={option}
            onPress={() => select(index)}
            disabled={disabled}
            accessibilityRole="tab"
            accessibilityLabel={option}
            accessibilityState={{ selected, disabled }}
            style={styles.segment}
          >
            <Text
              style={[
                theme.typography.bodyBold,
                {
                  color: selected
                    ? '#000000'
                    : colors.textMuted,
                  fontWeight: selected ? '800' : '600',
                },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
            >
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: PADDING,
    minHeight: 44,
    alignItems: 'stretch',
  },
  thumb: {
    position: 'absolute',
    top: PADDING,
    bottom: PADDING,
    left: PADDING,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
});
