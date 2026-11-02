import * as React from 'react';
import { Pressable } from 'react-native';

import { usePointer } from '@wcpos/components/lib/device';
import { PosterThumb, tintOf } from '@wcpos/components/poster-tile';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useT } from '../../../../../contexts/translations';
import { useImageAttachment } from '../../../hooks/use-image-attachment';
import { useRowExpanded } from '../../../components/product/variable-product-row/use-row-expansion';

/**
 *
 */
/** The POS table's variable image cell: a stacked Poster thumb; the press still toggles the inline rows. */
export function PosVariableProductImage({
	row,
	table,
}: CellContext<{ record: EngineRecord<'products'> }, 'image'>) {
	const payload = useRecordField(row.original.record, (record) => record.payload);
	const imageURL = payload.images?.[0]?.src;
	const pointer = usePointer();
	const t = useT();
	const { uri, error } = useImageAttachment(row.original.record, imageURL ?? '');

	const setRowExpanded = table.options.meta?.setRowExpanded;
	const isExpanded = useRowExpanded(table.options.meta, row.id);

	const handlePress = React.useCallback(() => {
		setRowExpanded?.(row.id, !isExpanded);
	}, [row.id, isExpanded, setRowExpanded]);

	return (
		<Pressable
			onPress={handlePress}
			className="self-start"
			accessibilityRole="button"
			accessibilityLabel={t('common.variations')}
			accessibilityState={{ expanded: isExpanded }}
		>
			<PosterThumb
				picture={
					!imageURL || error
						? { kind: 'tint', tint: tintOf(payload.categories?.[0]?.id ?? payload.name ?? '') }
						: { kind: 'image', source: { uri }, recyclingKey: row.original.record.uuid }
				}
				stacked
				size={pointer === 'coarse' ? 'md' : 'sm'}
			/>
		</Pressable>
	);
}
