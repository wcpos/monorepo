import * as React from 'react';

import get from 'lodash/get';

import { Image } from '@wcpos/components/image';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useImageAttachment } from '../../hooks/use-image-attachment';
import { PRODUCT_IMAGE_PLACEHOLDER } from './product-image-placeholder';
import { useRenderProbe } from '../../pos/products/render-probe';

/**
 *
 */
export function ProductImage({ row }: CellContext<{ record: EngineRecord<'products'> }, 'image'>) {
	const images = useRecordField(row.original.record, (record) => record.payload.images);
	const imageURL = get(images, [0, 'src'], undefined);
	const { uri, error } = useImageAttachment(row.original.record, imageURL ?? '');
	// Troubleshooting probe (render-probe.ts): the table's image cell, same questions as the tile.
	useRenderProbe('ProductImageCell', row.original.record.uuid, {
		record: row.original.record,
		images,
		imageURL,
		uri,
		error,
	});

	if (error) {
		return (
			<Image
				source={{ uri: PRODUCT_IMAGE_PLACEHOLDER }}
				recyclingKey={row.original.record.uuid}
				className="h-20 w-full rounded"
			/>
		);
	}

	return (
		<Image
			source={{ uri }}
			recyclingKey={row.original.record.uuid}
			className="h-20 w-full rounded"
		/>
	);
}
