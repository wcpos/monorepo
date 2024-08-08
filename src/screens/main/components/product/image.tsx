import * as React from 'react';

import get from 'lodash/get';
import { useObservableEagerState } from 'observable-hooks';

import { Image } from '@wcpos/tailwind/src/image';

import { useImageAttachment } from '../../hooks/use-image-attachment';

type Props = {
	item: import('@wcpos/database').ProductDocument;
	cellWidth: number;
};

/**
 *
 */
export const ProductImage = ({ item: product, cellWidth }: Props) => {
	const images = useObservableEagerState(product.images$);
	const imageURL = get(images, [0, 'src'], undefined);
	const source = useImageAttachment(product, imageURL);

	return <Image source={source} recyclingKey={product.uuid} />;
};
