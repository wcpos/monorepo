import * as React from 'react';
import { Pressable } from 'react-native';

import get from 'lodash/get';
import { useObservableEagerState } from 'observable-hooks';

import { Image } from '@wcpos/components/src/image';

import { useImageAttachment } from '../../hooks/use-image-attachment';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export const VariableProductImage = ({
	row,
}: CellContext<{ document: ProductDocument }, 'image'>) => {
	const product = row.original.document;
	const images = useObservableEagerState(product.images$);
	const imageURL = get(images, [0, 'src'], undefined);
	const source = useImageAttachment(product, imageURL);

	return (
		<Pressable onPress={() => row.toggleExpanded()} className="w-full h-20">
			<Image source={source} recyclingKey={product.uuid} className="w-full h-full" />
		</Pressable>
	);
};
