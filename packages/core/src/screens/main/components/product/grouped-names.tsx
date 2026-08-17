import * as React from 'react';

import { CellContext } from '@tanstack/react-table';
import { useObservableSuspense } from 'observable-hooks';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import { remoteIdOrNull } from '@wcpos/sync-core';

import { useT } from '../../../../contexts/translations';
import { useCollectionBinding } from '../../../../query';

import type { QueryStateOf } from '../../../../query';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
function GroupedNamesList({
	resource,
}: {
	resource: ReturnType<typeof useCollectionBinding<'products'>>['resource'];
}) {
	const result = useObservableSuspense(resource);
	const names = result.hits.map((hit) => hit.record?.payload.name);
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
export function GroupedNames({
	row,
}: CellContext<{ document: ProductDocument; record: EngineRecord<'products'> }, 'name'>) {
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
	const binding = useCollectionBinding('products', state, { remoteIds });

	return <GroupedNamesList resource={binding.resource} />;
}
