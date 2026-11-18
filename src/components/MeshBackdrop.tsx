import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { Blur, Canvas, Circle, Fill, Group } from '@shopify/react-native-skia';

const { width: W, height: H } = Dimensions.get('window');

/**
 * Soft pastel "mesh gradient" backdrop (peach / mint / lavender / pink blobs on
 * a near-white base) for the modern bento dashboard. Pure Skia, no new deps.
 */
export const MeshBackdrop: React.FC = () => (
  <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
    <Fill color="#F4F4FF" />
    <Group>
      {/* cool aurora blobs: indigo / sky / violet / cyan */}
      <Circle cx={W * 0.86} cy={H * 0.06} r={W * 0.52} color="rgba(165,180,252,0.6)">
        <Blur blur={70} />
      </Circle>
      <Circle cx={W * 0.08} cy={H * 0.34} r={W * 0.46} color="rgba(186,230,253,0.55)">
        <Blur blur={72} />
      </Circle>
      <Circle cx={W * 0.92} cy={H * 0.72} r={W * 0.5} color="rgba(216,180,254,0.55)">
        <Blur blur={72} />
      </Circle>
      <Circle cx={W * 0.18} cy={H * 0.62} r={W * 0.36} color="rgba(165,243,252,0.45)">
        <Blur blur={70} />
      </Circle>
    </Group>
  </Canvas>
);

export default MeshBackdrop;
