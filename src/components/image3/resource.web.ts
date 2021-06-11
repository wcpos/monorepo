import { createResource } from '../../lib/react-cache';

const hashingFn = ({ src, srcSet }: { src: string; srcSet?: string }) => `${src}${srcSet}`;

export const ImgResource = createResource(({ src, srcSet }: { src: string; srcSet?: string }) => {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.src = src;
		if (srcSet) {
			image.srcset = srcSet;
		}
		image.onload = resolve;
		image.onerror = reject;
	}) as Promise<Event>;
}, hashingFn);
