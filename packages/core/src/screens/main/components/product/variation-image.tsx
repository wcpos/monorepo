import * as React from 'react';
import { View } from 'react-native';

// import Svg, { Line } from 'react-native-svg';

import { Image } from '@wcpos/components/image';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { PRODUCT_IMAGE_PLACEHOLDER } from './product-image-placeholder';
import { resolveImageSrc } from './resolve-image-src';
import { useImageAttachment } from '../../hooks/use-image-attachment';

/**
 *
 */
export function ProductVariationImage({
	row,
}: CellContext<{ record: EngineRecord<'variations'> }, 'image'>) {
	/**
	 * Both wire shapes, not just `image`: the wcpos/v2 lane serializes variations
	 * through the products controller, so a 1.10.0+ store sends `images[]` and the
	 * singular `image` is empty. Reading only `image` blanked every variation
	 * thumbnail in the list (#1577).
	 */
	const imageURL = useRecordField(row.original.record, (record) => resolveImageSrc(record.payload));
	const { uri, error } = useImageAttachment(row.original.record, imageURL ?? '');

	return (
		<>
			{/* <View className="absolute left-0 top-0 h-full w-5">
				<Svg width="100%">
					<Line x1="50%" y1="0" x2="50%" y2="100%" stroke="#E2E8F0" strokeWidth="1" />
					<Line x1="50%" y1="50%" x2="100%" y2="50%" stroke="#E2E8F0" strokeWidth="1" />
				</Svg>
			</View> */}
			<View className="w-full pl-3">
				<Image
					source={{ uri: error ? PRODUCT_IMAGE_PLACEHOLDER : uri }}
					recyclingKey={row.original.record.uuid}
					className="h-20 w-full rounded"
				/>
			</View>
		</>
	);
}
