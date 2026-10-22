import * as React from 'react';
import { View } from 'react-native';

import Animated, { useAnimatedRef, useScrollViewOffset } from 'react-native-reanimated';

import { Text } from '@wcpos/components/text';
import { type EngineRecord, type QueryHandle, useDocField } from '@wcpos/query';

import { useT } from '../../../../contexts/translations';
import { useQueryHandleFields } from '../../../../query';
import { matchesStockStatusFilter } from '../../components/product/stock-filter';
import { useUISettings } from '../../contexts/ui-settings';
import { DealCell, DealFade, FRONT, type Measurable, useAirspace, useDeal } from './deal-stack';
import { TileGround } from '../../components/data-table/surface';
import { HandleProductsFooter } from './handle-footer';
import { ParentTile, VariationPlaceholder, VariationTile } from './tiles/variation-tile';

import type { SnapshotFields } from '../../../../query';
import type { GridFields } from './tiles/product-tile';

type Hit = { record: EngineRecord<'variations'> };

const TOTAL_FIELD: SnapshotFields = ['total'];
const ACTIVE_FIELD: SnapshotFields = ['active'];

function VariationsFooter({
	handle,
	name,
	parentCount,
	shownCount,
}: {
	handle: QueryHandle;
	name?: string;
	parentCount: number | undefined;
	shownCount: number;
}) {
	const t = useT();
	// One unconditional read (hooks run every render): the footer re-renders for the answer
	// and for `total`, used only when the parent lists no variations.
	const { ready, total: handleTotal } = useQueryHandleFields(handle, TOTAL_FIELD);
	// The parent is the denominator, floored at resident count; an absent list uses the
	// handle's total, and only once it has answered (no denominator before the first answer).
	const total =
		parentCount === undefined ? (ready ? handleTotal : null) : Math.max(parentCount, shownCount);
	return (
		<HandleProductsFooter
			collectionName="variations"
			handle={handle}
			total={total}
			drawnCount={shownCount}
		>
			<Text className="text-muted-foreground text-sm" numberOfLines={1}>
				{t('pos_products.n_variations_of', { count: parentCount ?? shownCount, name })}
			</Text>
		</HandleProductsFooter>
	);
}

/**
 * One product's variations as tiles, on the products grid's own columns. The first slot is
 * the product itself. Until the query answers, each variation's slot holds a placeholder, so
 * the deal never waits for data and what arrives lands in a slot that is already there.
 */
export function VariationsGrid({
	parent,
	back,
	handle,
	hits,
	stockStatus,
}: {
	parent: EngineRecord<'products'>;
	back: () => void;
	handle: QueryHandle;
	/** `undefined` until the query has answered. */
	hits: Hit[] | undefined;
	stockStatus?: string;
}) {
	const scroller = useAnimatedRef<Animated.ScrollView>();
	const scroll = useScrollViewOffset(scroller);
	// The slots rest inside this node; the stage measures it so the deal lands on the card, not
	// on the stage the card is inset from.
	const { placeGrid } = useDeal();
	const slotsNode = React.useRef<React.ComponentRef<typeof View>>(null);
	// The parent in flight may paint above the scroller, over the crumb row (see useAirspace).
	const air = useAirspace(scroll);
	const { uiSettings } = useUISettings('pos-products');
	const columns = useDocField(uiSettings, (value) => value.gridColumns);
	const gridFields = useDocField(uiSettings, (value) => value.gridFields) as GridFields;
	const name = useDocField(parent, (value) => value.payload.name);
	const parentCount = useDocField(parent, (value) => value.payload.variations?.length);
	// The source filters resident variations with the shared stock resolver, not a query filter.
	const shown = hits?.filter((hit) => matchesStockStatusFilter(hit.record.payload, stockStatus));
	const shownCount = shown?.length ?? 0;

	// A cold drill-in answers empty at once and fills in when the refresh returns. While that
	// refresh runs, every variation the parent lists and the query has not produced keeps a
	// placeholder slot: the deal goes out complete, and the tiles land in slots already there.
	// The handle's own activity flag, read without suspending: the grid never suspends.
	const { active: refreshing } = useQueryHandleFields(handle, ACTIVE_FIELD);
	const awaited =
		hits === undefined || refreshing ? Math.max(0, (parentCount ?? 0) - (hits?.length ?? 0)) : 0;
	const slots: (EngineRecord<'variations'> | null)[] = [
		...(shown ?? []).map((hit) => hit.record),
		...Array.from({ length: awaited }, () => null),
	];
	const count = slots.length + 1;
	const rows = Array.from({ length: Math.ceil(count / columns) }, (_, row) =>
		Array.from({ length: columns }, (_, column) => row * columns + column)
	);

	return (
		// The dealt grid lands on the ground under the crumb, as the products grid stands: one page
		// gutter in, less the tiles' own `m-1` (`TileGround`). The frame the slots rest in is
		// reported, not assumed.
		<View className="min-h-0 flex-1" testID="variations-surface">
			<TileGround>
				{/* The air frame moves itself in flight (`marginTop`): its own element, inside the
				    ground, so it never replaces the ground's `-mt-1`. */}
				<View testID="variations-air" className="min-h-0 flex-1" style={air.frame}>
					<View
						ref={slotsNode}
						className="min-h-0 flex-1"
						testID="variations-slots"
						onLayout={() => placeGrid(slotsNode.current as Measurable)}
					>
						<Animated.ScrollView
							ref={scroller}
							className="flex-1"
							style={air.scroller}
							testID="variations-grid-scroller"
						>
							{rows.map((row, rowIndex) => (
								<View
									key={rowIndex}
									className="flex-row"
									style={rowIndex === 0 ? FRONT : undefined}
								>
									{row.map((index) => {
										if (index >= count) return <View key={index} className="flex-1" />;
										const variation = index === 0 ? null : slots[index - 1];
										return (
											<DealCell
												key={index}
												index={index}
												count={count}
												columns={columns}
												scroll={scroll}
											>
												{index === 0 ? (
													<ParentTile record={parent} gridFields={gridFields} onPress={back} />
												) : variation ? (
													<VariationTile
														record={variation}
														parent={parent}
														gridFields={gridFields}
													/>
												) : (
													<VariationPlaceholder />
												)}
											</DealCell>
										);
									})}
								</View>
							))}
						</Animated.ScrollView>
					</View>
				</View>
			</TileGround>
			<DealFade>
				<VariationsFooter
					handle={handle}
					name={name}
					parentCount={parentCount}
					shownCount={shownCount}
				/>
			</DealFade>
		</View>
	);
}
