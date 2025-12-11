import { Image, ImageProps } from '../image';
import { cn } from '../lib/utils';

/**
 *
 */
export const Avatar = (props: ImageProps) => {
	return <Image className={cn('h-5 w-5 rounded-full')} {...props} />;
};

Avatar.displayName = 'Avatar';
