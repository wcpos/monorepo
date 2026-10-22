import * as React from 'react';
import { View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { useIsPhone } from '@wcpos/components/lib/device';
import { cn } from '@wcpos/components/lib/utils';
import { Suspense } from '@wcpos/components/suspense';
import type { QueryHandle } from '@wcpos/query';

import { ChipRowSkeleton } from '../chip-row';
import { withProAccess } from '../pro-guard';

type ListPage = Exclude<Parameters<typeof withProAccess>[1], 'reports'>;

/**
 * The chip row, standing from the first frame: it is a row of the page, not of the list, so it
 * stands above the body's loading boundary and the card never moves when the rows arrive. Its
 * own boundary holds the row's height while a pill answers, and a failed pill leaves the list.
 */
export function ListFrameChips({ children }: { children: React.ReactNode }) {
	return (
		<ErrorBoundary>
			<Suspense fallback={<ChipRowSkeleton />}>{children}</Suspense>
		</ErrorBoundary>
	);
}

/**
 * The body's loading and failure boundary: a failed read is thrown here, the fallback's reset
 * asks the handle again, and a changed query (its handle is new) clears the fallback on its own.
 */
export function ListFrameBoundary({
	handle,
	skeleton,
	children,
}: {
	handle: QueryHandle;
	skeleton: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<ErrorBoundary onReset={() => handle.retry()} resetKeys={[handle]}>
			<Suspense fallback={skeleton}>{children}</Suspense>
		</ErrorBoundary>
	);
}

type ColumnProps = {
	/** The guarded column's testID (e.g. `products-body`): chips, rows and body. */
	bodyTestID?: string;
	/** The screen's pill list, already a `ChipRow`. */
	chips?: React.ReactNode;
	/**
	 * Rows between the chips and the body: notices, the camera scanner, the storage outage
	 * banner. Each may render nothing, so the frame cannot pad a container it cannot see is
	 * empty: a zero-height end on each side makes the stack's own gap the gutter above and below
	 * the rows that do render, and the negative top takes back the chip row's bottom gutter, so
	 * an empty stack adds nothing.
	 */
	rows?: React.ReactNode;
	children: React.ReactNode;
} & (
	| { handle: QueryHandle; skeleton: React.ReactNode; bodyOwnsRows?: undefined }
	| {
			handle?: undefined;
			skeleton?: undefined;
			/**
			 * The body draws its own chip row (`ListFrameChips`) and boundary (`ListFrameBoundary`):
			 * Orders, whose chips stand in the list column beside its pane, never over the pane.
			 */
			bodyOwnsRows: true;
	  }
);

function Column({
	bodyTestID,
	chips,
	rows,
	handle,
	skeleton,
	bodyOwnsRows,
	children,
}: ColumnProps) {
	const phone = useIsPhone();
	// The row above the card brings the gutter over it; with no such row, the body brings it.
	// The phone's list runs edge to edge under the search row.
	const bodyGutter = !phone && chips == null && rows == null && !bodyOwnsRows;
	return (
		<View testID={bodyTestID} className="flex-1">
			{chips != null && <ListFrameChips>{chips}</ListFrameChips>}
			{rows != null && (
				<View className={cn('gap-gutter px-gutter', (chips != null || phone) && '-mt-gutter')}>
					<View />
					{rows}
					<View />
				</View>
			)}
			<View className={cn('flex-1', bodyGutter && 'pt-gutter')}>
				{handle ? (
					<ListFrameBoundary handle={handle} skeleton={skeleton}>
						{children}
					</ListFrameBoundary>
				) : (
					children
				)}
			</View>
		</View>
	);
}

// One guarded column per page, made once: a component made per render would remount the list.
const GUARDED_COLUMNS: Record<ListPage, React.ComponentType<ColumnProps>> = {
	products: withProAccess(Column, 'products'),
	orders: withProAccess(Column, 'orders'),
	customers: withProAccess(Column, 'customers'),
	coupons: withProAccess(Column, 'coupons'),
};

/**
 * The one frame a record list stands in — Products, Orders, Customers, Coupons and the POS
 * products column — so a change to the search bar, the chip row, the body surface or the
 * caption row moves every list as one (owner, 2026-10-22). The bar, then the chips, then any
 * rows, then the body, one page gutter apart (CODING_STANDARDS § Design, Gutters).
 *
 * `pro` wraps everything under the bar in the Pro preview guard, never the bar: on Free the
 * overlay must leave the bar's menu, bell and cashier reachable, or a Free user below lg has no
 * way off the page (Codex review).
 */
export function ListFrame({
	testID,
	bar,
	pro,
	safeArea = true,
	...column
}: ColumnProps & {
	testID?: string;
	/** A `ManagementBar`, or a `PageBar` (the POS column). */
	bar: React.ReactNode;
	/** The Pro page key: the guard covers chips, rows and body. */
	pro?: ListPage;
	/** Pads the bottom safe-area inset (default); `false` in a column that pads it already. */
	safeArea?: boolean;
}) {
	const { bottom } = useSafeAreaInsets();
	const Body = pro ? GUARDED_COLUMNS[pro] : Column;
	return (
		<View
			testID={testID}
			className="bg-background flex-1"
			style={safeArea && bottom ? { paddingBottom: bottom } : undefined}
		>
			{bar}
			<Body {...column} />
		</View>
	);
}
