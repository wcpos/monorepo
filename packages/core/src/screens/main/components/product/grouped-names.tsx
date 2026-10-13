import * as React from 'react';

import type { CellContext } from '@wcpos/core/table-types';
import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import { remoteIdOrNull } from '@wcpos/sync-core';

import { useT } from '../../../../contexts/translations';
import { useCollectionQueryHandle, useQuerySnapshot } from '../../../../query';

import type { QueryHandle, QueryStateOf } from '../../../../query';

/**
 *
 */
function GroupedNamesList({ handle }: { handle: QueryHandle }) {
	const { hits } = useQuerySnapshot(handle, []);
	const names = hits.map((hit) => hit.record?.payload.name);
	const t = useT();

	/**
	 * Sometimes the product name from WooCommerce is encoded in html entities
	 */
	return (
		<HStack className="flex-wrap gap-0">
			<Text className="text-muted-foreground text-xs">{`${t('common.grouped')}: `}</Text>
			<Text className="text-xs" decodeHtml>
				{names.join(', ')}
			</Text>
		</HStack>
	);
}

/**
 *
 */
export function GroupedNames({ row }: CellContext<{ record: EngineRecord<'products'> }, 'name'>) {
	const wooIds =
		useRecordField(row.original.record, (parent) => parent.payload.grouped_products) ?? [];
	const remoteIds = wooIds.map(remoteIdOrNull).filter((remoteId) => remoteId !== null);
	const state = React.useMemo<QueryStateOf<'products'>>(
		() => ({
			search: '',
			filters: { categories: [], tags: [], brands: [] },
			sort: { field: 'id', direction: 'asc' },
			limit: Math.max(wooIds.length, 1),
		}),
		[wooIds.length]
	);
	// The owner sits above the boundary: its retain (an effect) starts the read, so it must
	// commit while the list suspends.
	const handle = useCollectionQueryHandle('products', state, { remoteIds });

	return (
		<Suspense>
			<GroupedNamesList handle={handle} />
		</Suspense>
	);
}
