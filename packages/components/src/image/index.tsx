import * as React from 'react';

import { Image as ExpoImage, ImageProps as ExpoImageProps } from 'expo-image';
import { withUniwind } from 'uniwind';

/**
 * Styled ExpoImage component with className support.
 * withUniwind automatically maps className → style prop.
 */
const StyledExpoImage = withUniwind(ExpoImage);

export type ImageProps = ExpoImageProps & {
	/** Image border shape */
	// border?: 'square' | 'rounded' | 'circular';
	/** CSS class name for styling */
	className?: string;
};

// Fade a picture in on first load, but not when it comes back from the memory cache (a
// recycled grid cell scrolled back into view; the cell must pass a `recyclingKey`, or the new
// source counts as a source change and fades). 'memory', not 'all': the first sight after a
// cold start is a disk hit, and its fade still masks the decode. Native only; index.web.tsx
// keeps its plain 250 ms fade.
const FADE = { duration: 250, skipOnCacheHit: 'memory' } as const;

/**
 * Image component with Tailwind className support via Uniwind.
 * Uses expo-image for optimized image loading.
 */
export function Image({ source, ...props }: ImageProps) {
	return (
		<StyledExpoImage
			source={source}
			responsivePolicy="initial"
			contentFit="contain"
			transition={FADE}
			{...props}
		/>
	);
}
