import * as React from 'react';

import type { QueryHandle } from '@wcpos/query';

import { useQueryHandleFields } from '../../../../query';
import { CaptionRowInset } from '../../components/data-table/surface';
import { ProductsFooter, type ProductsFooterProps } from './footer';

import type { SnapshotFields } from '../../../../query';

const ACTIVE_FIELD: SnapshotFields = ['active'];

/**
 * The products caption row under a browse level, the term set or the dealt variations grid:
 * `total` and `count` are the caller's own values (a level's held as state and attributed to its
 * query; the variations grid's computed per render from the parent's list and the shown tiles),
 * the sync spinner is the engine's now, read here so the caller does not re-render when it flips.
 */
export function HandleProductsFooter({
	handle,
	total,
	count,
	collectionName = 'products',
	children,
}: {
	handle: QueryHandle;
	total: number | null;
	count: number;
	/** The collection the sync button's clear-and-sync resets: the variations pane's own. */
	collectionName?: ProductsFooterProps['collectionName'];
	children?: React.ReactNode;
}) {
	const { active } = useQueryHandleFields(handle, ACTIVE_FIELD);
	// Mounted outside DataTable, under the POS pane's dense card: the inset DataTable's own
	// footer mount gives it.
	return (
		<CaptionRowInset>
			<ProductsFooter
				collectionName={collectionName}
				active={active}
				total={total}
				sync={handle.sync}
				count={count}
			>
				{children}
			</ProductsFooter>
		</CaptionRowInset>
	);
}
