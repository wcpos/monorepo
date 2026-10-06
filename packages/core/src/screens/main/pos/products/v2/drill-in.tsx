import * as React from 'react';
import { View } from 'react-native';

import { Breadcrumb } from '@wcpos/components/breadcrumb';
import { type EngineRecord, useDocField } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import { QueryStateProvider } from '../../../../../query';
import { DealFade } from './deal-stack';
import { LevelBack } from './level-back';
import { VariationsPane } from './variations-pane';

type Crumb = { label: string; onPress: () => void; testID?: string };

/**
 * The detail pane of the products stage: the breadcrumb and one product's variations. The
 * breadcrumb is a row of its own on the ground above the grid's or the table's card (owner's
 * pick, option A of the 2026-10-05 drill-in mockup: never inside the card, never a card of
 * its own). With `tiles` it is the dealt grid's pane; otherwise the `PaneStack`'s pane.
 */
export function DrillIn({
	parent,
	back,
	stockStatus,
	tiles = false,
	parents,
}: {
	parent: EngineRecord<'products'>;
	back: () => void;
	stockStatus?: string;
	tiles?: boolean;
	/** The crumb's ancestors before the product; the last one is the way back (its `onPress` is
	 * `back`). Default: Products. */
	parents?: Crumb[];
}) {
	const name = useDocField(parent, (value) => value.payload.name);
	const count = useDocField(parent, (value) => value.payload.variations?.length ?? 0);
	const t = useT();
	// The Breadcrumb's last parent is its back control; it keeps the stable back testID.
	const crumbParents: [Crumb, ...Crumb[]] =
		parents && parents.length > 0
			? (parents.map((entry, index) =>
					index === parents.length - 1 ? { ...entry, testID: 'products-breadcrumb-back' } : entry
				) as [Crumb, ...Crumb[]])
			: [
					{
						label: t('pos_products.products_crumb'),
						onPress: back,
						testID: 'products-breadcrumb-back',
					},
				];
	const crumb = (
		<Breadcrumb
			parents={crumbParents}
			here={name}
			detail={t('pos_products.n_variations', { count })}
			autoFocus
			testID="products-breadcrumb"
		/>
	);
	return (
		<LevelBack onBack={back} testID="products-variations-pane">
			{tiles ? (
				// The dealt grid measures its own frame under this row (`placeGrid`). A tile dealt
				// from the products' first row sets off from under the crumb and its top is
				// clipped by the grid's scroller for the first frames; every other row travels up
				// or sideways and never leaves the scroller.
				<DealFade>{crumb}</DealFade>
			) : (
				crumb
			)}
			{/* The grid and the table size themselves to their parent, so they get one that
			    excludes the crumb; each brings its own card. */}
			<View className="flex-1">
				<QueryStateProvider
					collection="variations"
					initialPageSize={Number.MAX_SAFE_INTEGER}
					initialSort={{ field: 'name', direction: 'asc' }}
					initialFilters={{ status: 'publish' }}
				>
					<VariationsPane
						parent={parent}
						stockStatus={stockStatus}
						back={tiles ? back : undefined}
					/>
				</QueryStateProvider>
			</View>
		</LevelBack>
	);
}
