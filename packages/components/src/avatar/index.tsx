import { Image, ImageProps } from '../image';
import { cn } from '../lib/utils';

/**
 *
 */
export const Avatar = (props: ImageProps) => {
	return (
		<Image
			className={cn(
				// Size
				'h-5 w-5',
				// Shape
				'rounded-full'
			)}
			{...props}
		/>
	);
};

Avatar.displayName = 'Avatar';
