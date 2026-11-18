import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { TriangleAlert } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../design/ThemeContext';
import { Button } from './Button';

export interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  message?: string;
  /** Default 'Confirm' */
  confirmLabel?: string;
  /** Default 'Cancel' */
  cancelLabel?: string;
  /** Styles the confirm button red and uses a warning icon tint. */
  destructive?: boolean;
  /** Shows a spinner on the confirm button and blocks both buttons. */
  loading?: boolean;
  /** Lucide icon shown above the title. Default TriangleAlert. */
  icon?: LucideIcon;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  icon: Icon = TriangleAlert,
  onConfirm,
  onCancel,
}: ConfirmSheetProps): React.JSX.Element | null {
  const { theme } = useTheme();
  const { colors, spacing, radii, typography, durations } = theme;

  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);

  const unmount = useCallback(() => setMounted(false), []);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withTiming(1, {
        duration: durations.normal,
        reduceMotion: ReduceMotion.System,
      });
    } else {
      progress.value = withTiming(
        0,
        { duration: durations.fast, reduceMotion: ReduceMotion.System },
        finished => {
          if (finished) {
            runOnJS(unmount)();
          }
        },
      );
    }
  }, [visible, progress, durations.normal, durations.fast, unmount]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * 480 }],
  }));

  if (!mounted) {
    return null;
  }

  const tone = destructive ? colors.danger : colors.brand;
  const toneSoft = destructive ? colors.dangerSoft : colors.brandSoft;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={loading ? undefined : onCancel}
    >
      <View style={styles.root}>
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: colors.overlay },
            backdropStyle,
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={loading ? undefined : onCancel}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderTopLeftRadius: radii.xl,
              borderTopRightRadius: radii.xl,
              padding: spacing.xl,
              paddingBottom: spacing.xxl,
            },
            sheetStyle,
          ]}
          accessibilityViewIsModal
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: toneSoft, marginTop: spacing.lg },
            ]}
          >
            <Icon size={28} color={tone} strokeWidth={2} />
          </View>
          <Text
            style={[
              typography.h3,
              styles.centerText,
              { color: colors.text, marginTop: spacing.lg },
            ]}
            accessibilityRole="header"
          >
            {title}
          </Text>
          {message ? (
            <Text
              style={[
                typography.body,
                styles.centerText,
                { color: colors.textMuted, marginTop: spacing.sm },
              ]}
            >
              {message}
            </Text>
          ) : null}
          <View style={[styles.buttonRow, { marginTop: spacing.xl }]}>
            <Button
              title={cancelLabel}
              onPress={onCancel}
              variant="outline"
              disabled={loading}
              fullWidth
              style={styles.buttonLeft}
            />
            <View style={{ width: spacing.md }} />
            <Button
              title={confirmLabel}
              onPress={onConfirm}
              variant={destructive ? 'danger' : 'primary'}
              loading={loading}
              hapticType={destructive ? 'error' : 'success'}
              fullWidth
              style={styles.buttonRight}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: {
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    alignSelf: 'stretch',
  },
  buttonLeft: {
    flex: 1,
    width: undefined,
    alignSelf: 'auto',
  },
  buttonRight: {
    flex: 1,
    width: undefined,
    alignSelf: 'auto',
  },
});
