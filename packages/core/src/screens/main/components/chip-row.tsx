import * as React from 'react';
import { ScrollView, type ScrollViewInstance, View } from 'react-native';

import { cn } from '@wcpos/components/lib/utils';
import { Skeleton } from '@wcpos/components/skeleton';

import { useGround } from './ground';

/**
 * The chip row every list surface with pills has (Products, Orders, Coupons, the POS
 * products column): the page gutter all round, so the search above and the card below share one
 * edge, and the pills in a horizontal scroller. The plain wrapper sizes the row to its chips,
 * so the scroller never grows into the card's space (CODING_STANDARDS § Design, Gutters).
 *
 * A phone's screen edge keeps 16 (`p-4`): Apple's root-view minimum applies at the device edge;
 * the gutter is for the ground inside a window.
 *
 * `ref` reaches the scroller: the POS bar scrolls a pressed chip into view with it.
 */
export function ChipRow({
	testID,
	ref,
	children,
}: {
	testID?: string;
	ref?: React.Ref<ScrollViewInstance>;
	children: React.ReactNode;
}) {
	return (
		<View testID={testID} className={useGround().p}>
			<ScrollView
				ref={ref}
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerClassName="items-center gap-2"
			>
				{children}
			</ScrollView>
		</View>
	);
}

/** Enough pills to read as the row; the real count varies by page and by what is set. */
const PLACEHOLDER_CHIPS = 4;

/**
 * The chip row's frame while its pills are still answering: the same row at the
 * chips' own height, so the card under it stands where it will once the pills arrive. The row
 * used to mount with the table, after its skeleton, and push the card down when it came
 * (owner, 2026-10-22: "jarring, either load the filter bar or at least skeleton").
 */
export function ChipRowSkeleton() {
	const ground = useGround();
	return (
		<View testID="filter-bar-skeleton" className={cn('flex-row items-center gap-2', ground.p)}>
			{Array.from({ length: PLACEHOLDER_CHIPS }, (_, index) => (
				<Skeleton key={index} shape="chip" />
			))}
		</View>
	);
}
