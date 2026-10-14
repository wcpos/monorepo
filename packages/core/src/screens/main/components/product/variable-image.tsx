import * as React from 'react';
import { Pressable } from 'react-native';

import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { usePointer } from '@wcpos/components/lib/device';
import { PosterThumb, tintOf } from '@wcpos/components/poster-tile';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useImageAttachment } from '../../hooks/use-image-attachment';

/**
 *
 */
export function VariableProductImage({
	row,
	table,
}: CellContext<{ record: EngineRecord<'products'> }, 'image'>) {
	const payload = useRecordField(row.original.record, (record) => record.payload);
	const imageURL = payload.images?.[0]?.src;
	const pointer = usePointer();
	const { uri, error } = useImageAttachment(row.original.record, imageURL ?? '');

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
		<Pressable onPress={handlePress} className="self-start">
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
