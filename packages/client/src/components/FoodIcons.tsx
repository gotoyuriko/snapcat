/**
 * Cartoon-style vector icons for the donation food catalogue.
 * Flat, rounded shapes in the app's brand palette — no image assets required.
 */
import React from 'react';
import Svg, { Circle, Ellipse, G, Path, Rect, Text as SvgText } from 'react-native-svg';

interface FoodIconProps {
  size?: number;
}

/** Cat Kibble — a curved, two-tone dry-snack piece. */
export function KibbleIcon({ size = 32 }: FoodIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Path
        d="M38 6 C48 10 52 22 48 34 C45 44 38 54 30 58 C24 60 18 57 19 51 C20 46 25 44 27 39 C31 30 32 20 27 12 C25 8 30 4 38 6 Z"
        fill="#D9A066"
      />
      <Path
        d="M36 8 C43 12 45 21 42 30 C39 39 34 47 28 52 C25 54 22 52 23 49 C27 43 30 36 31 28 C32 20 31 13 29 9 C31 7 34 7 36 8 Z"
        fill="#A9642F"
      />
      <Ellipse cx="22" cy="55" rx="4.5" ry="3" fill="#C98E55" transform="rotate(-30 22 55)" />
    </Svg>
  );
}

/** Cat Snack — a tilted treat tube with a torn top and cat-face branding. */
export function SnackIcon({ size = 32 }: FoodIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <G transform="rotate(-30 32 32)">
        {/* Crimped end */}
        <Rect x="8" y="27" width="6" height="14" rx="2" fill="#E29B2A" stroke="#2A2A2A" strokeWidth="2" />
        {/* Tube body */}
        <Rect x="12" y="24" width="32" height="20" rx="4" fill="#F5B23E" stroke="#2A2A2A" strokeWidth="2" />
        {/* Torn top opening */}
        <Path
          d="M44 24 L48 20 L51 26 L54 19 L57 25 L44 30 Z"
          fill="#F5B23E"
          stroke="#2A2A2A"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* Paste squeeze coming out */}
        <Path
          d="M52 18 C56 14 60 16 58 20 C61 22 59 26 55 24"
          fill="#F0C89A"
          stroke="#2A2A2A"
          strokeWidth="1.5"
        />
        {/* Cat face */}
        <Circle cx="21" cy="34" r="6" fill="#2A2A2A" />
        <Path d="M16 30 L18 26 L20 30 Z" fill="#2A2A2A" />
        <Path d="M26 30 L24 26 L22 30 Z" fill="#2A2A2A" />
        <Circle cx="19" cy="34" r="0.9" fill="#fff" />
        <Circle cx="23" cy="34" r="0.9" fill="#fff" />
        {/* Label text lines */}
        <Path d="M31 40 L39 40" stroke="#2A2A2A" strokeWidth="1.5" strokeLinecap="round" />
        <Path d="M31 43 L37 43" stroke="#2A2A2A" strokeWidth="1.5" strokeLinecap="round" />
      </G>
    </Svg>
  );
}

/** Tuna Can — a labeled can with tuna flesh visible on top. */
export function TunaCanIcon({ size = 32 }: FoodIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      {/* Bottom rim */}
      <Ellipse cx="32" cy="46" rx="24" ry="8" fill="#C98A3D" />
      {/* Body color blocks */}
      <Rect x="8" y="30" width="48" height="16" fill="#E86A3C" />
      <Rect x="40" y="30" width="16" height="16" fill="#C23B29" />
      <Rect x="24" y="30" width="16" height="16" fill="#F3ECDD" />
      {/* Trim lines */}
      <Rect x="8" y="30" width="48" height="2" fill="#1F5C4E" />
      <Rect x="8" y="44" width="48" height="2" fill="#1F5C4E" />
      {/* TUNA label text */}
      <SvgText x="32" y="41" fontSize="7" fontWeight="bold" fill="#1F5C4E" textAnchor="middle">
        TUNA
      </SvgText>
      {/* Top rim */}
      <Ellipse cx="32" cy="30" rx="24" ry="8" fill="#D89A4E" />
      {/* Inner well */}
      <Ellipse cx="32" cy="29" rx="19" ry="6" fill="#5A3620" />
      {/* Tuna meat chunks */}
      <Path d="M16 29 C20 24 26 24 30 29 C26 32 20 32 16 29 Z" fill="#D98476" />
      <Path d="M28 29 C32 23 38 23 42 29 C38 33 32 33 28 29 Z" fill="#E39485" />
      <Path d="M40 29 C43 25 47 25 49 29 C47 31 43 31 40 29 Z" fill="#D98476" />
      {/* Meat striations */}
      <Path d="M18 28 Q20 26 24 28" stroke="#F0C9BE" strokeWidth="0.8" fill="none" />
      <Path d="M31 28 Q34 25 38 28" stroke="#F0C9BE" strokeWidth="0.8" fill="none" />
    </Svg>
  );
}

export function FoodIcon({ name, size = 32 }: { name: string; size?: number }) {
  const normalized = name.toLowerCase();
  if (normalized.includes('kibble')) return <KibbleIcon size={size} />;
  if (normalized.includes('tuna')) return <TunaCanIcon size={size} />;
  if (normalized.includes('snack') || normalized.includes('treat')) return <SnackIcon size={size} />;
  return <KibbleIcon size={size} />;
}
