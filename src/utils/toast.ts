/**
 * Toast helper + themed toast renderers for react-native-toast-message.
 *
 * Usage:
 *   showToast({ type: 'success', title: 'Checked in', message: 'At 09:02' });
 *
 * `toastConfig` must be passed to the <Toast config={toastConfig} /> element
 * mounted at the app root. The ThemeProvider keeps the module-level theme in
 * sync via setToastTheme() so toasts are dark-mode aware.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import type { ToastConfig, ToastConfigParams } from 'react-native-toast-message';
import {
  CircleCheck,
  CircleX,
  Info,
  TriangleAlert,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { lightTheme, radii, spacing, typography } from '../design/tokens';
import type { AppTheme } from '../design/tokens';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ShowToastOptions {
  type: ToastType;
  title: string;
  message?: string;
  /** ms, default 3500 */
  duration?: number;
  position?: 'top' | 'bottom';
  onPress?: () => void;
}

// --- module-level theme accessor (updated by ThemeProvider) -----------------

let currentTheme: AppTheme = lightTheme;

export function setToastTheme(theme: AppTheme): void {
  currentTheme = theme;
}

// --- imperative API ----------------------------------------------------------

export function showToast(options: ShowToastOptions): void {
  Toast.show({
    type: options.type,
    text1: options.title,
    text2: options.message,
    visibilityTime: options.duration ?? 3500,
    position: options.position ?? 'top',
    topOffset: 60,
    onPress: options.onPress,
  });
}

export function hideToast(): void {
  Toast.hide();
}

// --- themed renderers ---------------------------------------------------------

const TONE_META: Record<ToastType, { icon: LucideIcon }> = {
  success: { icon: CircleCheck },
  error: { icon: CircleX },
  warning: { icon: TriangleAlert },
  info: { icon: Info },
};

function toneColor(type: ToastType, theme: AppTheme): string {
  switch (type) {
    case 'success':
      return theme.colors.success;
    case 'error':
      return theme.colors.danger;
    case 'warning':
      return theme.colors.warning;
    case 'info':
    default:
      return theme.colors.brand; // teal for informational toasts
  }
}

function renderToast(
  type: ToastType,
  params: ToastConfigParams<unknown>,
): React.ReactElement {
  const theme = currentTheme;
  const color = toneColor(type, theme);
  const IconCmp = TONE_META[type].icon;

  return React.createElement(
    View,
    {
      style: [
        styles.container,
        theme.shadows.e3,
        {
          backgroundColor: theme.colors.surface,
          borderLeftColor: color,
          borderColor: theme.colors.border,
        },
      ],
      accessibilityRole: 'alert' as const,
      accessibilityLiveRegion: 'polite' as const,
    },
    React.createElement(IconCmp, { size: 20, color, strokeWidth: 2.25 }),
    React.createElement(
      View,
      { style: styles.textWrap },
      params.text1
        ? React.createElement(
            Text,
            {
              style: [styles.title, { color: theme.colors.text }],
              numberOfLines: 2,
            },
            params.text1,
          )
        : null,
      params.text2
        ? React.createElement(
            Text,
            {
              style: [styles.message, { color: theme.colors.textMuted }],
              numberOfLines: 3,
            },
            params.text2,
          )
        : null,
    ),
  );
}

export const toastConfig: ToastConfig = {
  success: params => renderToast('success', params),
  error: params => renderToast('error', params),
  info: params => renderToast('info', params),
  warning: params => renderToast('warning', params),
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    width: '92%',
    maxWidth: 480,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderLeftWidth: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  textWrap: {
    flex: 1,
    marginLeft: spacing.md,
  },
  title: {
    ...typography.bodyBold,
  },
  message: {
    ...typography.caption,
    marginTop: 2,
  },
});
