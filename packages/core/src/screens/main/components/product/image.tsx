import * as React from 'react';

import get from 'lodash/get';

import { Image } from '@wcpos/components/image';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useImageAttachment } from '../../hooks/use-image-attachment';
import { PRODUCT_IMAGE_PLACEHOLDER } from './product-image-placeholder';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export function ProductImage({
	row,
}: CellContext<{ document: ProductDocument; record: EngineRecord<'products'> }, 'image'>) {
	const product = row.original.document;
	const images = useRecordField(row.original.record, (record) => record.payload.images);
	const imageURL = get(images, [0, 'src'], undefined);
	const { uri, error } = useImageAttachment(product, imageURL ?? '');

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
