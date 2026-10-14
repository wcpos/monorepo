import * as React from 'react';
import { View } from 'react-native';

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
			<View className="w-full pl-3">
				<Image
					source={{ uri: error ? PRODUCT_IMAGE_PLACEHOLDER : uri }}
					recyclingKey={row.original.record.uuid}
					className="h-20 w-full rounded"
					// The placeholder is the absence of an image, not one arriving: it does not fade in.
					{...(error ? { transition: 0 } : {})}
				/>
			</View>
		</>
	);
}
