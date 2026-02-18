import React from 'react';
import Svg, { Path, Rect, Defs, LinearGradient, Stop, G } from 'react-native-svg';

interface Props {
  size?: number;
  color?: string;
}

// Lucide shield path (viewBox 0 0 24 24)
const SHIELD_PATH =
  'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z';

export function CloakIcon({ size = 24, color }: Props) {
  if (color) {
    // Single-color shield for tab icons, headers, etc.
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d={SHIELD_PATH} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }

  // Full branded logo: gradient rounded square + white shield
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
      <Defs>
        <LinearGradient id="logo-grad" x1="0" y1="0" x2="96" y2="96" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#3B82F6" />
          <Stop offset="100%" stopColor="#8B5CF6" />
        </LinearGradient>
      </Defs>
      <Rect width={96} height={96} rx={24} fill="url(#logo-grad)" />
      <G transform="translate(22, 22) scale(2.1667)">
        <Path d={SHIELD_PATH} fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </G>
    </Svg>
  );
}
