import { Image, ImageProps } from '../image';

/**
 *
 */
export const Avatar = (props: ImageProps) => {
	return <Image className="w-5 h-5 rounded-full" {...props} />;
};

Avatar.displayName = 'Avatar';
