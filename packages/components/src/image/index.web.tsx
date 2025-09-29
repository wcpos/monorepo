import * as React from 'react';

import { Image as ExpoImage, ImageProps as ExpoImageProps } from 'expo-image';

export type ImageProps = ExpoImageProps & {
	/** Image border shape */
	// border?: 'square' | 'rounded' | 'circular';
	/** CSS class name for styling */
	className?: string;
};

/**
 * Web-specific Image component that passes className directly to ExpoImage
 */
export function Image({ source, className, ...props }: ImageProps) {
	return (
		<ExpoImage
			source={source}
			responsivePolicy="initial"
			contentFit="contain"
			transition={250}
			className={className}
			{...props}
		/>
	);
}
