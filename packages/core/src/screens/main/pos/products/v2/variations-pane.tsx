import * as React from 'react';

import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import * as VirtualizedList from '@wcpos/components/virtualized-list';
import { type EngineRecord, type QueryHandle, useDocField } from '@wcpos/query';
import { remoteIdOrNull } from '@wcpos/sync-core';

import { useT } from '../../../../../contexts/translations';
import {
	useCollectionQueryHandle,
	useDrawnHandle,
	useQueryHandleFields,
	useQuerySnapshot,
	useQueryState,
	useQueryStateActions,
} from '../../../../../query';
import { DataTable } from '../../../components/data-table/v2';
import { DataTableSkeleton } from '../../../components/data-table/v2/skeleton';
import { matchesStockStatusFilter } from '../../../components/product/stock-filter';
import { useVariationsRefresh } from '../cells/variations-popover/use-variations-refresh';
import { OwnFooter, OwnFooterContext, type OwnFooterNumbers } from './own-footer';
import { VariationsGrid } from './variations-grid';
import { VariationName, VariationRow, VariationStock } from './rows/variation-row';
import { Price } from '../cells/price';
import { SKU } from '../cells/sku';
import { COGS } from '../cells/cogs';
import { ProductVariationImage } from '../../../components/product/variation-image';

import type { SnapshotFields } from '../../../../../query';

type Hit = { record: EngineRecord<'variations'> };

type Props = {
	parent: EngineRecord<'products'>;
	stockStatus?: string;
	/** Given by the dealt grid: the variations are tiles, and the parent tile goes back. */
	back?: () => void;
};

// The footer's sync button already turns while the variations refresh. The list's own
// loading band would add and remove a strip under the rows on every drill-in.
function NoListFooter() {
	return null;
}

// The pane re-renders for the answer alone; the footer and the grid read `active` themselves.
const ANSWER_ONLY: SnapshotFields = [];

export function VariationsPane({ parent, back, ...props }: Props) {
	const state = useQueryState<'variations'>();
	const variationIds: number[] = useDocField(parent, (value) => value.payload.variations) ?? [];
	const remoteIds = variationIds.map(remoteIdOrNull).filter((remoteId) => remoteId !== null);
	const handle = useCollectionQueryHandle('variations', state, { remoteIds });
	// The popover's bounded, logged refresh retry: a first refresh that hangs or returns
	// nothing during a transient failure must not leave the default drill-in pane empty.
	useVariationsRefresh(handle);
	// The query answers within a frame of mounting, but not during the first render. Suspending
	// on it commits the fallback, and React holds a committed fallback for 300 ms before
	// revealing what replaces it: a third of a second of placeholder over rows that were ready
	// almost at once. So the first answer is read here, without suspending, where the swap is
	// immediate — and lands while the pane is still off-stage.
	// A query that fails counts as answered: the reader below throws it into the error boundary.
	const snapshot = useQueryHandleFields(handle, ANSWER_ONLY);
	const answered = snapshot.ready || snapshot.error !== null;
	// Once the table has drawn an answer it keeps drawing: a changed handle (a header sort) is
	// the table's own stale-while-loading (`useDrawnHandle`), not a return to the skeleton.
	// Stored during render (React's "information from previous renders" pattern), so the first
	// answer and the latch land in the same commit.
	const [drawn, setDrawn] = React.useState(answered);
	if (answered && !drawn) setDrawn(true);
	// The grid's stale-while-loading, by the same pattern: a non-suspending reader cannot lean on
	// `useDrawnHandle`, and a changed key (a products pull moving the parent's variation list, a
	// scope change) starts its read only in the owner's effect. The last answer's hits stay
	// dealt until the new handle answers, rather than every tile becoming a placeholder.
	const liveHits = snapshot.ready ? (snapshot.hits as Hit[]) : undefined;
	const [lastHits, setLastHits] = React.useState(liveHits);
	if (liveHits && liveHits !== lastHits) setLastHits(liveHits);
	if (back) {
		// The grid mounts no reader that would throw a failure: it reaches the stage's boundary
		// from here. The handle is owned below that boundary, so its reset remounts the pane
		// over a fresh read rather than the failed one.
		if (snapshot.error) throw snapshot.error;
		// The grid is handed the answer itself: it never suspends (a tile that suspended, or was
		// swapped for a skeleton, mid-deal would lose its place), and it has to hear the
		// variations arrive when a cold refresh fills an answer that started empty.
		return (
			<VariationsGrid
				parent={parent}
				back={back}
				handle={handle}
				hits={liveHits ?? lastHits}
				{...props}
			/>
		);
	}
	// As many skeleton rows as the parent has variations: if the answer is slow, the rows that
	// replace them land in the same places and the pane does not reflow.
	const skeleton = <DataTableSkeleton id="pos-products" rowCount={variationIds.length || 1} />;
	if (!answered && !drawn) return skeleton;
	return (
		<Suspense fallback={skeleton}>
			<VariationsTable parent={parent} handle={handle} {...props} />
		</Suspense>
	);
}

function VariationsTable({ parent, handle, stockStatus }: Props & { handle: QueryHandle }) {
	const state = useQueryState<'variations'>();
	const actions = useQueryStateActions<'variations'>();
	// Answered before this mounts, so the first render does not suspend; a changed handle keeps
	// the previous one's rows while it answers, as the DataTable below draws them.
	const result = useQuerySnapshot(useDrawnHandle(handle), ANSWER_ONLY).result;
	// The source filters resident variations with the shared stock resolver, not a query filter.
	const hits = (result.hits as Hit[]).filter((hit) =>
		matchesStockStatusFilter(hit.record.payload, stockStatus)
	);
	const name = useDocField(parent, (value) => value.payload.name);
	const parentCount = useDocField(parent, (value) => value.payload.variations?.length);
	const t = useT();
	// The footer's numbers are the pane's own (own-footer.tsx): the shown rows, and the parent as
	// the denominator, floored at the resident count — as a value, so it lands in the same commit
	// as the count; an absent list leaves the drawn handle's total to the footer.
	const footer = React.useMemo<OwnFooterNumbers>(
		() => ({
			count: hits.length,
			total: parentCount === undefined ? undefined : Math.max(parentCount, hits.length),
			children: (
				<Text className="text-muted-foreground text-sm" numberOfLines={1}>
					{t('pos_products.n_variations_of', { count: parentCount ?? hits.length, name })}
				</Text>
			),
		}),
		[hits.length, parentCount, name, t]
	);
	return (
		<OwnFooterContext.Provider value={footer}>
			<DataTable<{ record: EngineRecord<'variations'> }>
				id="pos-products"
				persistSort={false}
				collectionName="variations"
				handle={handle}
				tableConfig={{ data: hits }}
				sort={state.sort}
				actions={actions}
				cells={{
					name: VariationName,
					price: Price,
					stock_quantity: VariationStock,
					sku: SKU,
					cost_of_goods_sold: COGS,
					image: ProductVariationImage,
					actions: () => null,
				}}
				// The rows travel with their pane; none of them animates on its own.
				renderItem={({ item }) => (
					<VirtualizedList.Item>
						<VariationRow item={item} parent={parent} />
					</VirtualizedList.Item>
				)}
				ListFooterComponent={NoListFooter}
				TableFooterComponent={OwnFooter}
			/>
		</OwnFooterContext.Provider>
	);
}
