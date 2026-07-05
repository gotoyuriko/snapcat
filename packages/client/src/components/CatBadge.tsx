/**
 * CatBadge — circular medal-style badge (Pokémon GO-inspired): the cat's
 * photo sits in the middle like a picture frame, surrounded by a decorated
 * ring whose ornamentation escalates with the badge tier:
 *   bronze  — copper ring with rivet studs
 *   silver  — polished double ring with compass diamonds
 *   gold    — golden ring with laurel ticks and a crowning star
 *   diamond — icy faceted ring with sparkles
 * Global (non-cat) badges show an icon on a tinted disc inside the same frame.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, {
  Circle,
  Path,
  Defs,
  LinearGradient,
  Stop,
  G,
  Polygon,
} from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from './CachedImage';

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'diamond';

interface TierTheme {
  ringStart: string;
  ringEnd: string;
  trim: string;
  accent: string;
  glow: string;
}

const TIER_THEMES: Record<BadgeTier, TierTheme> = {
  bronze: { ringStart: '#E8A46B', ringEnd: '#8C5A2B', trim: '#6E441F', accent: '#FFD9A8', glow: '#B9793F' },
  silver: { ringStart: '#F2F5F7', ringEnd: '#8D9AA5', trim: '#6C7A86', accent: '#FFFFFF', glow: '#C4CFD8' },
  gold: { ringStart: '#FFE28A', ringEnd: '#C8901A', trim: '#9A6D0D', accent: '#FFF6C9', glow: '#F3B93C' },
  diamond: { ringStart: '#DFF6FF', ringEnd: '#5FB4DB', trim: '#3E85A8', accent: '#FFFFFF', glow: '#9FDCF5' },
};

/** 5-point star polygon points centred on (cx, cy). */
function starPoints(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return pts.join(' ');
}

/** 4-point sparkle polygon points centred on (cx, cy). */
function sparklePoints(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / 4) * i - Math.PI / 2;
    pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return pts.join(' ');
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

interface CatBadgeProps {
  /** Outer diameter in px */
  size: number;
  tier?: BadgeTier;
  /** Cat photo shown in the frame centre (per-cat badges) */
  photoUrl?: string | null;
  /** Ionicon shown instead when there is no photo (global badges) */
  icon?: keyof typeof Ionicons.glyphMap;
}

export function CatBadge({ size, tier = 'bronze', photoUrl, icon }: CatBadgeProps) {
  const theme = TIER_THEMES[tier] ?? TIER_THEMES.bronze;
  const c = size / 2;
  const ringOuter = c - 1.5;
  const ringWidth = size * 0.115;
  const ringMid = ringOuter - ringWidth / 2;
  const photoRadius = ringOuter - ringWidth - 1;
  const gradId = `ring-${tier}`;

  // Tier ornaments drawn on top of the ring band.
  const ornaments: React.ReactNode[] = [];
  if (tier === 'bronze') {
    // Rivet studs every 45°
    for (let deg = 0; deg < 360; deg += 45) {
      const p = polar(c, c, ringMid, deg);
      ornaments.push(
        <Circle key={`stud-${deg}`} cx={p.x} cy={p.y} r={ringWidth * 0.22} fill={theme.trim} />,
      );
    }
  } else if (tier === 'silver') {
    // Inner polished line + compass diamonds
    ornaments.push(
      <Circle
        key="inner-line"
        cx={c}
        cy={c}
        r={ringMid}
        stroke={theme.accent}
        strokeWidth={1}
        fill="none"
        opacity={0.7}
      />,
    );
    for (let deg = 0; deg < 360; deg += 90) {
      const p = polar(c, c, ringMid, deg);
      const s = ringWidth * 0.34;
      ornaments.push(
        <Polygon
          key={`dia-${deg}`}
          points={`${p.x},${p.y - s} ${p.x + s},${p.y} ${p.x},${p.y + s} ${p.x - s},${p.y}`}
          fill={theme.accent}
          stroke={theme.trim}
          strokeWidth={0.6}
        />,
      );
    }
  } else if (tier === 'gold') {
    // Laurel ticks along the lower arc + crowning star at the top
    for (let deg = 120; deg <= 240; deg += 15) {
      const p1 = polar(c, c, ringOuter - 1.5, deg);
      const p2 = polar(c, c, ringOuter - ringWidth + 1.5, deg);
      ornaments.push(
        <Path
          key={`tick-${deg}`}
          d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`}
          stroke={theme.trim}
          strokeWidth={1.4}
          strokeLinecap="round"
          opacity={0.85}
        />,
      );
    }
    const top = polar(c, c, ringMid, 0);
    ornaments.push(
      <Polygon
        key="star"
        points={starPoints(top.x, top.y, ringWidth * 0.62, ringWidth * 0.26)}
        fill={theme.accent}
        stroke={theme.trim}
        strokeWidth={0.8}
      />,
    );
  } else if (tier === 'diamond') {
    // Faceted segments + sparkles
    for (let deg = 0; deg < 360; deg += 30) {
      const p1 = polar(c, c, ringOuter - 1, deg);
      const p2 = polar(c, c, ringOuter - ringWidth + 1, deg);
      ornaments.push(
        <Path
          key={`facet-${deg}`}
          d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`}
          stroke={theme.accent}
          strokeWidth={0.9}
          opacity={0.65}
        />,
      );
    }
    for (const deg of [0, 120, 240]) {
      const p = polar(c, c, ringMid, deg);
      ornaments.push(
        <Polygon
          key={`spark-${deg}`}
          points={sparklePoints(p.x, p.y, ringWidth * 0.55, ringWidth * 0.18)}
          fill={theme.accent}
          stroke={theme.trim}
          strokeWidth={0.5}
        />,
      );
    }
  }

  return (
    <View style={{ width: size, height: size }}>
      {/* Photo (or icon disc) clipped to the frame's inner circle */}
      <View
        style={[
          styles.centerWrap,
          {
            left: c - photoRadius,
            top: c - photoRadius,
            width: photoRadius * 2,
            height: photoRadius * 2,
            borderRadius: photoRadius,
            backgroundColor: photoUrl ? '#eee' : theme.glow,
          },
        ]}
      >
        {photoUrl ? (
          <CachedImage
            source={{ uri: photoUrl }}
            style={{ width: photoRadius * 2, height: photoRadius * 2 }}
            contentFit="cover"
          />
        ) : (
          <Ionicons name={icon ?? 'paw'} size={photoRadius * 1.1} color="#fff" />
        )}
      </View>

      {/* Decorated ring frame on top */}
      <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={theme.ringStart} />
            <Stop offset="1" stopColor={theme.ringEnd} />
          </LinearGradient>
        </Defs>
        <G>
          {/* Ring band */}
          <Circle
            cx={c}
            cy={c}
            r={ringMid}
            stroke={`url(#${gradId})`}
            strokeWidth={ringWidth}
            fill="none"
          />
          {/* Outer + inner trims */}
          <Circle cx={c} cy={c} r={ringOuter} stroke={theme.trim} strokeWidth={1.2} fill="none" />
          <Circle
            cx={c}
            cy={c}
            r={ringOuter - ringWidth}
            stroke={theme.trim}
            strokeWidth={1.2}
            fill="none"
          />
          {ornaments}
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  centerWrap: {
    position: 'absolute',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
