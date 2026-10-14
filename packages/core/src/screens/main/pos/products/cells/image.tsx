import * as React from 'react';

import { usePointer } from '@wcpos/components/lib/device';
import { PosterThumb, tintOf } from '@wcpos/components/poster-tile';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useImageAttachment } from '../../../hooks/use-image-attachment';
import { displayStockStatus } from '../../../components/product/resolve-stock';

/** The POS table's image cell: the Poster thumb (the management screen keeps `components/product/image`). */
export function PosProductImage({
	row,
}: CellContext<{ record: EngineRecord<'products'> }, 'image'>) {
	const payload = useRecordField(row.original.record, (record) => record.payload);
	const imageURL = payload.images?.[0]?.src;
	const { uri, error } = useImageAttachment(row.original.record, imageURL ?? '');
	const pointer = usePointer();
	return (
		<PosterThumb
			picture={
				!imageURL || error
					? { kind: 'tint', tint: tintOf(payload.categories?.[0]?.id ?? payload.name ?? '') }
					: { kind: 'image', source: { uri }, recyclingKey: row.original.record.uuid }
			}
			out={displayStockStatus(payload) === 'outofstock'}
			size={pointer === 'coarse' ? 'md' : 'sm'}
		/>
	);
}
