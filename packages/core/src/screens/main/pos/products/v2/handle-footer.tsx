import * as React from 'react';

import type { QueryHandle } from '@wcpos/query';

import { useQueryHandleFields } from '../../../../../query';
import { ProductsFooterRow } from './footer';

import type { SnapshotFields } from '../../../../../query';

const ACTIVE_FIELD: SnapshotFields = ['active'];

/**
 * The products caption row under a browse level or the term set: `total` and `count` are the
 * level's own (held as state, attributed to its query), the sync spinner is the engine's now,
 * read here so the level above does not re-render when it flips.
 */
export function HandleProductsFooter({
	handle,
	total,
	count,
	children,
}: {
	handle: QueryHandle;
	total: number | null;
	count: number;
	children?: React.ReactNode;
}) {
	const { active } = useQueryHandleFields(handle, ACTIVE_FIELD);
	return (
		<ProductsFooterRow
			collectionName="products"
			active={active}
			total={total}
			sync={handle.sync}
			count={count}
		>
			{children}
		</ProductsFooterRow>
	);
}
