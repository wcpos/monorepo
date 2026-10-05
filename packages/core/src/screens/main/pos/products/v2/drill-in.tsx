import * as React from 'react';
import { Platform, View, type ViewProps } from 'react-native';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { Breadcrumb } from '@wcpos/components/breadcrumb';
import { usePointer } from '@wcpos/components/lib/device';
import { type EngineRecord, useDocField } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import { QueryStateProvider } from '../../../../../query';
import { DealFade, useDeal } from './deal-stack';
import { VariationsPane } from './variations-pane';

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
}: {
	parent: EngineRecord<'products'>;
	back: () => void;
	stockStatus?: string;
	tiles?: boolean;
}) {
	const { setTop } = useDeal();
	const name = useDocField(parent, (value) => value.payload.name);
	const count = useDocField(parent, (value) => value.payload.variations?.length ?? 0);
	const pointer = usePointer();
	const t = useT();
	const pan = Gesture.Pan()
		.runOnJS(true)
		.enabled(pointer === 'coarse')
		.hitSlop({ left: 0, width: 24 })
		.activeOffsetX(24)
		.failOffsetY([-24, 24])
		.onEnd((event) => {
			if (event.translationX > 24) back();
		});
	const crumb = (
		<Breadcrumb
			parents={[
				{
					label: t('pos_products.products_crumb'),
					onPress: back,
					testID: 'products-breadcrumb-back',
				},
			]}
			here={name}
			detail={t('pos_products.n_variations', { count })}
			autoFocus
			testID="products-breadcrumb"
		/>
	);
	return (
		<GestureDetector gesture={pan}>
			<View
				className="flex-1"
				testID="products-variations-pane"
				{...(Platform.OS === 'web'
					? {
							onKeyDown: (event: Parameters<NonNullable<ViewProps['onKeyDown']>>[0]) => {
								if (event.nativeEvent.key === 'Escape') {
									event.stopPropagation();
									back();
								}
							},
						}
					: {})}
			>
				{tiles ? (
					// The crumb's height is where the dealt grid's first row rests (`DealCell`).
					// A tile dealt from the products' first row sets off from under the crumb and
					// its top is clipped by the grid's scroller for the first frames; every other
					// row travels up or sideways and never leaves the scroller.
					<DealFade onLayout={(event) => setTop(event.nativeEvent.layout.height)}>{crumb}</DealFade>
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
			</View>
		</GestureDetector>
	);
}
