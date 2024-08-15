import * as React from 'react';
import { View } from 'react-native';

import get from 'lodash/get';
import { useObservableEagerState } from 'observable-hooks';
import Svg, { Line, Rect } from 'react-native-svg';

import type { ProductVariationDocument } from '@wcpos/database';
import type { CellContext } from '@wcpos/tailwind/src/data-table';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { Image } from '@wcpos/tailwind/src/image';
import { TableCell } from '@wcpos/tailwind/src/table2';

import { useImageAttachment } from '../../hooks/use-image-attachment';

/**
 *
 */
export const ProductVariationImage = ({ row }: CellContext<ProductVariationDocument, 'image'>) => {
	const variation = row.original;
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
			<View className="pl-3 flex-1">
				<Image source={source} recyclingKey={variation.uuid} className="w-full h-20" />
			</View>
		</>
	);
};
