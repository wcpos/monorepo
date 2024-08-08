import * as React from 'react';

import get from 'lodash/get';
import { useObservableEagerState } from 'observable-hooks';

import { Image } from '@wcpos/tailwind/src/image';

import { useImageAttachment } from '../../hooks/use-image-attachment';

type Props = {
	item: import('@wcpos/database').ProductVariationDocument;
	cellWidth: number;
};

/**
 *
 */
export const ProductVariationImage = ({ item: product, cellWidth }: Props) => {
	const image = useObservableEagerState(product.image$);
	const imageURL = get(image, 'src', undefined);
	const source = useImageAttachment(product, imageURL);

	return <Image source={source} recyclingKey={product.uuid} />;
};
