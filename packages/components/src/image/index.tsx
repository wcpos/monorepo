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
			transition={250}
			{...props}
		/>
	);
}
