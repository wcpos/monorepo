import * as React from 'react';

import { Image as ExpoImage, ImageProps as ExpoImageProps } from 'expo-image';
import { cssInterop } from 'nativewind';

/**
 *
 */
const ExpoImageWithClassname = cssInterop(ExpoImage, {
	className: 'style',
});

export type ImageProps = ExpoImageProps & {
	/** Image border shape */
	// border?: 'square' | 'rounded' | 'circular';
	/** CSS class name for styling */
	className?: string;
};

/**
 *
 */
export const Image = ({ source, ...props }: ImageProps) => {
	return (
		<ExpoImageWithClassname
			source={source}
			responsivePolicy="initial"
			contentFit="contain"
			transition={250}
			{...props}
		/>
	);
};

Image.displayName = 'Image';

/**
 * memoizing does not fix flashing transition
 */
// export default React.memo(Image);
