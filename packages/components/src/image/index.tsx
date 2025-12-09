import * as React from 'react';

import { Image as ExpoImage, ImageProps as ExpoImageProps } from 'expo-image';
import { withUniwind } from 'uniwind';

/**
 * Styled ExpoImage component for native platforms with className support
 */
const ExpoImageWithClassname = withUniwind(ExpoImage, {
	className: 'style',
});

export type ImageProps = ExpoImageProps & {
	/** Image border shape */
	// border?: 'square' | 'rounded' | 'circular';
	/** CSS class name for styling */
	className?: string;
};

/**
 * Native-specific Image component that uses styled wrapper for className support
 */
export function Image({ source, ...props }: ImageProps) {
	return (
		<ExpoImageWithClassname
			source={source}
			responsivePolicy="initial"
			contentFit="contain"
			transition={250}
			{...props}
		/>
	);
}
