import { Image } from 'react-native';
import { createResource } from '../../lib/react-cache';

const hashingFn = ({ src, srcSet }: { src: string; srcSet?: string }) => `${src}${srcSet}`;

export const ImgResource = createResource(({ src, srcSet }: { src: string; srcSet?: string }) => {
	return new Promise((resolve, reject) => {
		Image.getSize(src, resolve, reject);
	}) as Promise<Event>;
}, hashingFn);
