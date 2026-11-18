import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Edge } from 'react-native-safe-area-context';
import { useTheme } from '../../design/ThemeContext';
import { useTabBarScrollHandler } from './tabBarScroll';

export interface ScreenProps {
  children: React.ReactNode;
  /** Wrap children in a ScrollView. Default false. */
  scroll?: boolean;
  /** Pull-to-refresh (only when scroll). Wire both props. */
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Default true */
  keyboardAvoiding?: boolean;
  /** Apply theme.spacing.lg padding to the content. Default true. */
  padded?: boolean;
  /** SafeArea edges. Default ['top', 'left', 'right']. */
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Screen({
  children,
  scroll = false,
  refreshing = false,
  onRefresh,
  keyboardAvoiding = true,
  padded = true,
  edges = ['top', 'left', 'right'],
  style,
  contentContainerStyle,
  testID,
}: ScreenProps): React.JSX.Element {
  const { theme } = useTheme();
  const { colors, spacing } = theme;
  // Feeds scroll offset to the FloatingTabBar so it collapses on scroll-down.
  const onScroll = useTabBarScrollHandler();

  const padding = padded ? spacing.lg : 0;

  let content: React.ReactNode;
  if (scroll) {
    content = (
      <Animated.ScrollView
        style={styles.flex}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[
          // Extra bottom space so content clears the floating tab bar.
          { padding, paddingBottom: padding + spacing.xl + 72 },
          contentContainerStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.brand}
              colors={[colors.brand]}
              progressBackgroundColor={colors.surface}
            />
          ) : undefined
        }
      >
        {children}
      </Animated.ScrollView>
    );
  } else {
    content = (
      <View style={[styles.flex, { padding }, contentContainerStyle]}>
        {children}
      </View>
    );
  }

  if (keyboardAvoiding) {
    content = (
      <KeyboardAvoidingView
        style={styles.flex}
        // Android was left with behavior:undefined — a no-op, relying entirely
        // on the manifest's windowSoftInputMode="adjustResize" to shrink the
        // window when the keyboard opens. That stopped reliably resizing once
        // this app enabled a translucent/edge-to-edge status bar (see
        // LoginScreen's <StatusBar translucent .../> and targetSdk 36 —
        // Android 15's edge-to-edge changes are a well-known regression for
        // adjustResize specifically on translucent windows), so a focused
        // input near the bottom of any scrollable screen was left sitting
        // right under the keyboard with nothing pushing it back into view.
        // "height" makes RN own the resize in JS instead of depending on that
        // native behavior, so it works regardless of the window's edge-to-edge
        // state.
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {content}
      </KeyboardAvoidingView>
    );
  }

  return (
    <SafeAreaView
      edges={edges}
      testID={testID}
      style={[styles.flex, { backgroundColor: colors.bg }, style]}
    >
      {content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
