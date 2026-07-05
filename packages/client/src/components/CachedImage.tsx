/**
 * CachedImage — drop-in image with aggressive caching so photos appear
 * instantly after their first load.
 *
 * Backed by expo-image: memory + disk cache (survives app restarts), a short
 * fade-in, and a neutral placeholder tint while bytes arrive. Use this for
 * all remote cat/partner/document photos instead of react-native's Image.
 */
import React from 'react';
import { Image, ImageProps } from 'expo-image';

// A tiny neutral blurhash shown while the real image loads.
const PLACEHOLDER_BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';

export function CachedImage(props: ImageProps) {
  return (
    <Image
      cachePolicy="memory-disk"
      transition={150}
      placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
      {...props}
    />
  );
}
