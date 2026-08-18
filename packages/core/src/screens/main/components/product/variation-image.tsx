import * as React from 'react';
import { View } from 'react-native';

import get from 'lodash/get';
// import Svg, { Line } from 'react-native-svg';

import { Image } from '@wcpos/components/image';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { ProductVariationDocument } from '@wcpos/database';
import type { CellContext } from '@wcpos/core/table-types';

import { useImageAttachment } from '../../hooks/use-image-attachment';

/**
 *
 */
export function ProductVariationImage({
	row,
}: CellContext<
	{ document: ProductVariationDocument; record: EngineRecord<'variations'> },
	'image'
>) {
	const variation = row.original.document;
	const image = useRecordField(row.original.record, (record) => record.payload.image);
	const imageURL = get(image, 'src', undefined);
	const { uri } = useImageAttachment(variation, imageURL ?? '');

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
					source={{ uri }}
					recyclingKey={row.original.record.uuid}
					className="h-20 w-full rounded"
				/>
			</View>
		</>
	);
}
