import * as React from 'react';
import { Pressable } from 'react-native';

import get from 'lodash/get';

import { Image } from '@wcpos/components/image';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useImageAttachment } from '../../hooks/use-image-attachment';
import { useRowExpanded } from './variable-product-row/use-row-expansion';

/**
 *
 */
export function VariableProductImage({
	row,
	table,
}: CellContext<{ record: EngineRecord<'products'> }, 'image'>) {
	const images = useRecordField(row.original.record, (record) => record.payload.images);
	const imageURL = get(images, [0, 'src'], undefined);
	const { uri } = useImageAttachment(row.original.record, imageURL ?? '');

	const setRowExpanded = table.options.meta?.setRowExpanded;
	const isExpanded = useRowExpanded(table.options.meta, row.id);

	const handlePress = React.useCallback(() => {
		setRowExpanded?.(row.id, !isExpanded);
	}, [row.id, isExpanded, setRowExpanded]);

	return (
		<Pressable onPress={handlePress} className="h-20 w-full">
			<Image
				source={{ uri }}
				recyclingKey={row.original.record.uuid}
				className="h-full w-full rounded"
			/>
		</Pressable>
	);
}
