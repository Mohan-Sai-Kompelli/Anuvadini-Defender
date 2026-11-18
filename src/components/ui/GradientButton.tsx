import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import type { LucideIcon } from 'lucide-react-native';
import { haptic } from '../../utils/haptics';

export interface GradientButtonProps {
  title: string;
  onPress: () => void;
  /** Skia gradient stops, e.g. ['#34D399', '#059669']. */
  colors: string[];
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  height?: number;
}

/** A vibrant gradient CTA (Skia gradient fill) with icon + label. */
export const GradientButton: React.FC<GradientButtonProps> = ({
  title,
  onPress,
  colors,
  icon: Icon,
  loading = false,
  disabled = false,
  height = 56,
}) => {
  const [w, setW] = useState(0);
  const off = disabled || loading;
  return (
    <Pressable
      onPress={off ? undefined : () => { haptic('impactLight'); onPress(); }}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={[
        styles.btn,
        { height, opacity: disabled ? 0.45 : 1, shadowColor: colors[colors.length - 1] },
      ]}
    >
      {w > 0 ? (
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
          <Rect x={0} y={0} width={w} height={height}>
            <LinearGradient start={vec(0, 0)} end={vec(w, height)} colors={colors} />
          </Rect>
        </Canvas>
      ) : null}
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <View style={styles.row}>
          {Icon ? <Icon size={20} color="#fff" /> : null}
          <Text style={styles.text}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
};

export default GradientButton;

const styles = StyleSheet.create({
  btn: {
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { color: '#FFFFFF', fontWeight: '800', fontSize: 16, letterSpacing: 0.2 },
});
