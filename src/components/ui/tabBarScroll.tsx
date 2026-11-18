import React, { createContext, useContext } from 'react';
import {
  useAnimatedScrollHandler,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * Bridges screen scroll position -> the FloatingTabBar so it can collapse on
 * scroll-down and expand on scroll-up. React Native has no global scroll, so
 * each scrollable screen writes its content offset into this shared value and
 * the tab bar reacts to it on the UI thread.
 *
 * Wire-up:
 *   <TabBarScrollProvider> around the <Tab.Navigator>.
 *   In a screen: const onScroll = useTabBarScrollHandler();
 *               <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} />
 *   In the tab bar: const scrollY = useTabBarScrollY();
 */
const TabBarScrollContext = createContext<SharedValue<number> | null>(null);

export function TabBarScrollProvider({ children }: { children: React.ReactNode }) {
  const scrollY = useSharedValue(0);
  return (
    <TabBarScrollContext.Provider value={scrollY}>{children}</TabBarScrollContext.Provider>
  );
}

/** The shared scroll offset, or null when used outside a provider. */
export function useTabBarScrollY(): SharedValue<number> | null {
  return useContext(TabBarScrollContext);
}

/**
 * Returns an animated scroll handler to spread onto an Animated.ScrollView /
 * Animated.FlatList. Safe to use outside a provider (writes to a throwaway
 * value, so non-tab screens still work unchanged).
 */
export function useTabBarScrollHandler() {
  const ctx = useContext(TabBarScrollContext);
  const fallback = useSharedValue(0);
  const target = ctx ?? fallback;
  return useAnimatedScrollHandler({
    onScroll: (e) => {
      'worklet';
      target.value = e.contentOffset.y;
    },
  });
}
