import React, { Suspense } from 'react';
import { ImageSourcePropType } from 'react-native';
import { createResource, SimpleCache } from 'simple-cache-provider';
import Loader from '../loader';
import { Img } from './styles';

const getImage = createResource((src: string) => {
	const image = new Image();
	return new Promise((res, rej) => {
		image.src = src;
		image.onload = () => res(src);
		image.onerror = rej;
	});
});

export type Props = {
	source: string | ImageSourcePropType;
	border?: 'rounded' | 'circular';
	style?: {};
};

const ImageLoader = ({ border, source, ...props }: Props) => {
	return (
		<Suspense fallback={<Loader />}>
			<SimpleCache.Consumer>
				{(cache: any) => {
					const src = getImage.read(cache, source);
					return <Img source={src} border={border} {...props} />;
				}}
			</SimpleCache.Consumer>
		</Suspense>
	);
};

export default ImageLoader;
