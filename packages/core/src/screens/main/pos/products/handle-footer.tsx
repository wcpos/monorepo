import * as React from 'react';

import type { QueryHandle } from '@wcpos/query';

import { useQueryHandleFields } from '../../../../query';
import { CaptionRowInset } from '../../components/data-table/surface';
import { ProductsFooter, type ProductsFooterProps } from './footer';

import type { SnapshotFields } from '../../../../query';

const ACTIVE_FIELD: SnapshotFields = ['active'];

/**
 * The products caption row under a browse level, the term set or the dealt variations grid:
 * `total` and `drawnCount` are the caller's own values (a level's held as state and attributed to its
 * query; the variations grid's computed per render from the parent's list and the shown tiles),
 * the sync spinner is the engine's now, read here so the caller does not re-render when it flips.
 */
export function HandleProductsFooter({
	handle,
	total,
	drawnCount,
	collectionName = 'products',
	label,
}: {
	handle: QueryHandle;
	total: number | null;
	drawnCount: number;
	/** The collection the sync button's clear-and-sync resets: the variations pane's own. */
	collectionName?: ProductsFooterProps['collectionName'];
	label?: string;
}) {
	const { active } = useQueryHandleFields(handle, ACTIVE_FIELD);
	// Mounted outside DataTable, under the POS grid or card: the inset DataTable's own footer
	// mount gives it (surface.tsx).
	return (
		<CaptionRowInset>
			<ProductsFooter
				collectionName={collectionName}
				active={active}
				total={total}
				sync={handle.sync}
				drawnCount={drawnCount}
				label={label}
			/>
		</CaptionRowInset>
	);
}
