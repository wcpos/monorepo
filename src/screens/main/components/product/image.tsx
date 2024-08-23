import * as React from 'react';

import get from 'lodash/get';
import { useObservableEagerState } from 'observable-hooks';

import { Image } from '@wcpos/tailwind/src/image';

import { useImageAttachment } from '../../hooks/use-image-attachment';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export const ProductImage = ({ row }: CellContext<ProductDocument, 'image'>) => {
	const product = row.original;
	const images = useObservableEagerState(product.images$);
	const imageURL = get(images, [0, 'src'], undefined);
	const source = useImageAttachment(product, imageURL);

	return <Image source={source} recyclingKey={product.uuid} className="w-full h-20" />;
};
