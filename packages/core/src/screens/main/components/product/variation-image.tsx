import * as React from 'react';
import { View } from 'react-native';

import get from 'lodash/get';
import { useObservableEagerState } from 'observable-hooks';
import Svg, { Line } from 'react-native-svg';

import { Image } from '@wcpos/components/src/image';
import type { ProductVariationDocument } from '@wcpos/database';

import { useImageAttachment } from '../../hooks/use-image-attachment';

import type { CellContext } from '@tanstack/react-table';

/**
 *
 */
export const ProductVariationImage = ({
	row,
}: CellContext<{ document: ProductVariationDocument }, 'image'>) => {
	const variation = row.original.document;
	const image = useObservableEagerState(variation.image$);
	const imageURL = get(image, 'src', undefined);
	const source = useImageAttachment(variation, imageURL);

	return (
		<>
			<View className="absolute w-5 h-full top-0 left-0">
				<Svg width="100%">
					<Line x1="50%" y1="0" x2="50%" y2="100%" stroke="#E2E8F0" strokeWidth="1" />
					<Line x1="50%" y1="50%" x2="100%" y2="50%" stroke="#E2E8F0" strokeWidth="1" />
				</Svg>
			</View>
			<View className="pl-3 w-full">
				<Image source={source} recyclingKey={variation.uuid} className="w-full h-20" />
			</View>
		</>
	);
};
