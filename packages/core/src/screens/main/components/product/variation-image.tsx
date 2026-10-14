import * as React from 'react';

import { usePointer } from '@wcpos/components/lib/device';
import { PosterThumb, tintOf } from '@wcpos/components/poster-tile';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useImageAttachment } from '../../hooks/use-image-attachment';
import { displayStockStatus } from './resolve-stock';
import { resolveImageSrc } from './resolve-image-src';

export function ProductVariationImage({
	row,
}: CellContext<{ record: EngineRecord<'variations'> }, 'image'>) {
	const payload = useRecordField(row.original.record, (record) => record.payload);
	const imageURL = resolveImageSrc(payload);
	const { uri, error } = useImageAttachment(row.original.record, imageURL ?? '');
	const pointer = usePointer();
	return (
		<PosterThumb
			picture={
				!imageURL || error
					? { kind: 'tint', tint: tintOf(payload.parent_id ?? payload.name ?? '') }
					: { kind: 'image', source: { uri }, recyclingKey: row.original.record.uuid }
			}
			out={displayStockStatus(payload) === 'outofstock'}
			size={pointer === 'coarse' ? 'md' : 'sm'}
		/>
	);
}
