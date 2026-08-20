import * as React from 'react';
import { Pressable } from 'react-native';

import get from 'lodash/get';
import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { Image } from '@wcpos/components/image';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useImageAttachment } from '../../hooks/use-image-attachment';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export function VariableProductImage({
	row,
	table,
}: CellContext<{ document: ProductDocument; record: EngineRecord<'products'> }, 'image'>) {
	const images = useRecordField(row.original.record, (record) => record.payload.images);
	const imageURL = get(images, [0, 'src'], undefined);
	const { uri } = useImageAttachment(row.original.record, imageURL ?? '');

	/**
	 * Use setRowExpanded from table meta to bypass TanStack's buggy updater function
	 */
	const meta = table.options.meta as unknown as {
		setRowExpanded?: (id: string, expanded: boolean) => void;
		expanded$: import('rxjs').Observable<Record<string, boolean>>;
	};
	const setRowExpanded = meta?.setRowExpanded;
	const isExpanded$ = React.useMemo(
		() => meta.expanded$.pipe(map((expanded: Record<string, boolean>) => !!expanded[row.id])),
		[meta.expanded$, row.id]
	);
	const isExpanded = useObservableEagerState(isExpanded$);

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
