import * as React from 'react';
import { View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@wcpos/components/empty-state';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { useIsPhone, usePointer } from '@wcpos/components/lib/device';
import { cn } from '@wcpos/components/lib/utils';
import { Suspense } from '@wcpos/components/suspense';
import type * as VirtualizedList from '@wcpos/components/virtualized-list';
import { useGround } from '@wcpos/components/lib/ground';
import { ChipRowSkeleton } from '@wcpos/components/chip-row';

import { useDrawnHandle, useQuerySnapshot, useQueryStateActions } from '../../../../query';
import { withProAccess } from '../pro-guard';

import type {
	CollectionKey,
	QueryHandle,
	QuerySnapshot,
	QueryStateActions,
	SnapshotFields,
} from '../../../../query';

type ListPageKey = Exclude<Parameters<typeof withProAccess>[1], 'reports'>;

function PassThrough({ children }: { children: React.ReactNode }) {
	return <>{children}</>;
}

// One guard per page, made once: a component made per render would remount the list.
const GUARDS: Record<ListPageKey, React.ComponentType<{ children: React.ReactNode }>> = {
	products: withProAccess(PassThrough, 'products'),
	orders: withProAccess(PassThrough, 'orders'),
	customers: withProAccess(PassThrough, 'customers'),
	coupons: withProAccess(PassThrough, 'coupons'),
};

/**
 * The shell a record list page stands in (Products, Orders, Customers, Coupons): the ground,
 * the bottom inset, the bar, then the page's column. `pro` wraps everything under the bar in
 * the Pro preview guard, never the bar: on Free the overlay must leave the bar's menu, bell and
 * cashier reachable, or a Free user below lg has no way off the page (Codex review).
 */
export function ListPage({
	testID,
	bar,
	pro,
	insetBottom = true,
	children,
}: {
	testID?: string;
	/** A `ManagementBar`, or a `PageBar`. */
	bar: React.ReactNode;
	/** The Pro page key: the guard covers what is under the bar. */
	pro?: ListPageKey;
	/** Pads the bottom safe-area inset (default); `false` in a column that pads it already. */
	insetBottom?: boolean;
	children: React.ReactNode;
}) {
	const { bottom } = useSafeAreaInsets();
	const Guard = pro ? GUARDS[pro] : PassThrough;
	return (
		<View
			testID={testID}
			className="bg-background flex-1"
			style={insetBottom && bottom ? { paddingBottom: bottom } : undefined}
		>
			{bar}
			<Guard>{children}</Guard>
		</View>
	);
}

type RowRender<TParams> = (
	params: TParams
) => React.ReactElement<React.ComponentProps<typeof VirtualizedList.Item>>;

/** What a list's column hands its table: the narrowed actions, the row and the empty state. */
export type ListTable<TParams> = {
	actions: Pick<QueryStateActions<CollectionKey>, 'setSort' | 'extendLimit' | 'setFilter'>;
	/** The coarse or the fine row, by the pointer. */
	renderItem: RowRender<TParams>;
	noDataMessage: React.ReactElement;
};

type ListProps<TParams> = {
	/** Names the list: its searching line is `${id}-searching-line`. */
	id: string;
	handle: QueryHandle;
	skeleton: React.ReactNode;
	/** The touch row and the table row. */
	renderRow: { coarse: RowRender<TParams>; fine: RowRender<TParams> };
	/** A search or a filter narrows the list: no rows is then "nothing matches", with the clear. */
	narrowed: boolean;
	empty: { title: string; description: string };
	noResults: { title: string; clear: string };
	/** Draws the table from its props and the drawn answer (deferred: the rows it shows). */
	children: (table: ListTable<TParams>, result: QuerySnapshot['result']) => React.ReactNode;
};

// The list re-renders for the answer only; the table and the footer read their own fields.
const ANSWER_ONLY: SnapshotFields = [];

/**
 * The list's body, inside the column's boundary: suspended on until the first answer, a changed
 * query keeps the drawn rows while the new handle answers (`useDrawnHandle`), and a pending search
 * over rows it keeps shows the searching line and dims them.
 */
function ListBody<TParams>({
	id,
	handle,
	renderRow,
	narrowed,
	empty,
	noResults,
	children,
}: ListProps<TParams>) {
	const actions = useQueryStateActions();
	const { result } = useQuerySnapshot(useDrawnHandle(handle), ANSWER_ONLY);
	const drawn = React.useDeferredValue(result);
	const pending = drawn.searchState === 'pending' && drawn.hits.length > 0;
	const pointer = usePointer();
	const tableActions = React.useMemo(
		() => ({
			setSort: actions.setSort,
			extendLimit: actions.extendLimit,
			setFilter: actions.setFilter,
		}),
		[actions]
	);
	const clear = () => {
		actions.resetFilters();
		actions.clearSearch();
	};
	const noDataMessage = narrowed ? (
		<EmptyState
			testID="no-data-message"
			kind="no-results"
			title={noResults.title}
			action={{ label: noResults.clear, onPress: clear }}
		/>
	) : (
		<EmptyState testID="no-data-message" kind="empty" {...empty} />
	);
	return (
		<>
			{pending && <View testID={`${id}-searching-line`} className="bg-primary h-0.5" />}
			<View className={cn('flex-1', pending && 'opacity-60')}>
				{children(
					{
						actions: tableActions,
						renderItem: pointer === 'coarse' ? renderRow.coarse : renderRow.fine,
						noDataMessage,
					},
					drawn
				)}
			</View>
		</>
	);
}

/**
 * The one column a record list stands in — the list pages and the POS products column — so a
 * change to the chip row, the rows or the body moves every list as one (owner, 2026-10-22).
 * The chips, then any rows, then the body, one page gutter apart (CODING_STANDARDS § Design,
 * Gutters).
 *
 * With `handle` and `skeleton` the body stands in the list's retry boundary: a failed read is
 * thrown there, the fallback's reset asks the handle again, and a changed query (its handle is
 * new) clears the fallback on its own; `ListBody` draws the rest. Without them the body brings
 * its own (the POS stage, whose skeleton is measured from the body it would replace).
 */
export function ListColumn<TParams>({
	testID,
	chips,
	rows,
	...body
}: {
	testID?: string;
	/** The screen's pill list, already a `ChipRow`. */
	chips?: React.ReactNode;
	/**
	 * Rows between the chips and the body: notices, the camera scanner, the storage outage
	 * banner. Each may render nothing, so the column cannot pad a container it cannot see is
	 * empty: a zero-height end on each side makes the stack's own gap the gutter above and below
	 * the rows that do render, and the negative top takes back the chip row's bottom gutter, so
	 * an empty stack adds nothing.
	 */
	rows?: React.ReactNode;
} & (ListProps<TParams> | { handle?: never; children: React.ReactNode })) {
	const phone = useIsPhone();
	const ground = useGround();
	// The row above the card brings the gutter over it; with no such row, the body brings it.
	// The phone's list runs edge to edge under the search row.
	const bodyGutter = !phone && chips == null && rows == null;
	return (
		<View testID={testID} className="min-h-0 flex-1">
			{chips != null && (
				// A row of the page, not of the list: it stands above the body's loading boundary so
				// the card never moves when the rows arrive, and holds its height while a pill answers.
				<ErrorBoundary>
					<Suspense fallback={<ChipRowSkeleton />}>{chips}</Suspense>
				</ErrorBoundary>
			)}
			{rows != null && (
				// The phone's screen edge keeps 16, as its chip row does (`useGround`).
				<View className={cn(ground.gap, ground.px, (chips != null || phone) && ground.negMt)}>
					<View />
					{rows}
					<View />
				</View>
			)}
			{/* `min-h-0`: a body whose root is `h-full` (the table skeleton) stays inside the
			    column beside the chips instead of overflowing it (Codex). */}
			<View className={cn('min-h-0 flex-1', bodyGutter && 'pt-gutter')}>
				{body.handle ? (
					<ErrorBoundary onReset={() => body.handle.retry()} resetKeys={[body.handle]}>
						<Suspense fallback={body.skeleton}>
							<ListBody {...body} />
						</Suspense>
					</ErrorBoundary>
				) : (
					body.children
				)}
			</View>
		</View>
	);
}
