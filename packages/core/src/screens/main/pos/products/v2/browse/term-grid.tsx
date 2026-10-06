import * as React from 'react';
import { View } from 'react-native';

import Animated, { useAnimatedRef, useScrollViewOffset } from 'react-native-reanimated';
import { of } from 'rxjs';

import { Breadcrumb } from '@wcpos/components/breadcrumb';
import * as VirtualizedList from '@wcpos/components/virtualized-list';
import { type EngineRecord, useDocField } from '@wcpos/query';

import { useT } from '../../../../../../contexts/translations';
import { useGuardedExtendLimit } from '../../../../../../query';
import { useUISettings } from '../../../../contexts/ui-settings';
import {
	DealCell,
	DealFade,
	DealStagedContext,
	FRONT,
	type Measurable,
	useDeal,
} from '../deal-stack';
import { ProductsFooter } from '../footer';
import { ProductTile } from '../grid/product-tile';
import { VariableProductTile } from '../grid/variable-product-tile';
import { LevelBack } from '../level-back';
import { BrowseRootFooter } from './browse-root-footer';
import { type BrowseTerm, termKey } from './browse-source';
import { type LevelAnswer, useLevelSnapshot } from './level-snapshot';
import { ParentTermTile, TermTile } from './term-tile';
import { useArmedEndReached } from './use-armed-end-reached';

import type { useRelationalCollectionBinding } from '../../../../../../query';
import type { GridFields } from '../grid/product-tile';

type Binding = ReturnType<typeof useRelationalCollectionBinding>;
type Crumb = { label: string; onPress: () => void; testID?: string };

const ALL: BrowseTerm = { kind: 'all' };

/** The term set at the root of a browse mode: All products first, then the terms, on the grid's columns. */
export function BrowseRootGrid({
	terms,
	onOpen,
	binding,
	settled,
}: {
	terms: BrowseTerm[];
	onOpen: (term: BrowseTerm, target?: Measurable) => void;
	/** The root products binding: the till's footer under the term set. */
	binding?: Binding;
	/** No level is over the root: the shared query is the root's (its footer's numbers). */
	settled?: boolean;
}) {
	const { uiSettings } = useUISettings('pos-products');
	const columns = useDocField(uiSettings, (value) => value.gridColumns);
	// The term whose copy is out on the stage steps aside, as a dealt product tile does.
	// The stage stages the path entry itself (`{ kind: 'term', term, target }`).
	const staged = React.useContext(DealStagedContext) as { kind?: string; term?: BrowseTerm } | null;
	const lifted = staged?.kind === 'term' && staged.term ? termKey(staged.term) : null;

	const rows = React.useMemo(() => {
		const cells = [ALL, ...terms];
		const chunked: BrowseTerm[][] = [];
		for (let i = 0; i < cells.length; i += columns) {
			chunked.push(cells.slice(i, i + columns));
		}
		return chunked;
	}, [terms, columns]);

	return (
		// Tiles are cards already: they sit straight on the ground, as the products grid's do.
		<View className="flex h-full flex-col px-1" testID="browse-root">
			<VirtualizedList.Root style={{ flex: 1 }}>
				<VirtualizedList.List
					data={rows}
					keyExtractor={(row) => termKey(row[0])}
					renderItem={({ item: row }) => (
						<VirtualizedList.Item>
							<View className="flex-row">
								{row.map((term) => (
									<TermTile
										key={termKey(term)}
										term={term}
										onPress={onOpen}
										lifted={lifted === termKey(term)}
									/>
								))}
								{/* Spacers for incomplete last row */}
								{row.length < columns &&
									Array.from({ length: columns - row.length }).map((_, i) => (
										<View key={`spacer-${i}`} className="m-1 flex-1" />
									))}
							</View>
						</VirtualizedList.Item>
					)}
					estimatedItemSize={200}
				/>
			</VirtualizedList.Root>
			{binding && <BrowseRootFooter binding={binding} settled={settled} />}
		</View>
	);
}

// How many product placeholders a cold level holds: a row's worth, so the deal goes out with shape.
const PLACEHOLDER_ROWS = 1;
// The products grid's onEndReachedThreshold.
const END_REACHED_THRESHOLD = 0.1;
const NO_TOTAL$ = of(null);

// The parent's row stays above the rows dealt out from under it. A list wraps each row in a
// cell of its own, so the lift goes on the cell: a row's own zIndex stops at that wrapper.
const frontRow = ({ index }: { index: number }) => (index === 0 ? FRONT : undefined);

/** A product that has not arrived yet: its slot is held, in a tile's own shape. */
function ProductPlaceholder() {
	return (
		<View className="bg-muted m-1 grow rounded-lg" aria-busy testID="product-placeholder">
			<View className="aspect-square" />
		</View>
	);
}

/**
 * One term's contents as a dealt grid: the term itself in slot 0 (the way back), its child
 * terms, then its products. The level shows its own answer (`useLevelSnapshot`), held while a
 * child is over it and while the query gathers its set on the way back, so the tiles travelling
 * home are the tiles that came out. All products is this same level, with no children.
 */
export function TermLevelGrid({
	term,
	children,
	answer,
	settled,
	showProducts,
	crumb,
	back,
	onOpenTerm,
	onDrillProduct,
	variationsStyle,
	binding,
	actions,
	empty,
}: {
	/** The dealt parent (slot 0). */
	term: BrowseTerm;
	/** Child terms, already filtered by display type. */
	children: BrowseTerm[];
	/** The products query's answer, attributed by the stage; `undefined` while it gathers. */
	answer: LevelAnswer | undefined;
	/** This level is the deepest: the query is its own (the stage's word). */
	settled: boolean;
	/** The display type is not `subcategories`. */
	showProducts: boolean;
	/** The crumb's detail (`N products`) is the level's own, from its snapshot. */
	crumb: { parents: Crumb[]; here: string };
	back: () => void;
	onOpenTerm: (term: BrowseTerm, target?: Measurable) => void;
	onDrillProduct: (record: EngineRecord<'products'>, target?: Measurable) => void;
	variationsStyle: string;
	binding: Binding;
	/** The root query's actions: the level extends the window as the cashier scrolls. */
	actions: { extendLimit: () => void };
	/** Shown under slot 0 when the level answered with no products and no child terms. */
	empty: React.ReactNode;
}) {
	// A level can be thousands of products: rows virtualise, and a `DealCell` in a row that has
	// scrolled out is unmounted (its deal timing is by index, nothing is lost).
	const scroller = useAnimatedRef<Animated.FlatList<number[]>>();
	const scroll = useScrollViewOffset(scroller);
	// The slots rest inside this node; the stage measures it so the deal lands on the grid, not
	// on the stage it is inset from.
	const { placeGrid } = useDeal();
	const slotsNode = React.useRef<React.ComponentRef<typeof View>>(null);
	const { uiSettings } = useUISettings('pos-products');
	const columns = useDocField(uiSettings, (value) => value.gridColumns);
	const gridFields = useDocField(uiSettings, (value) => value.gridFields) as GridFields;
	// The stage stages the path entry itself (`{ kind: 'term', term, target }`) or the product drill.
	const staged = React.useContext(DealStagedContext) as { kind?: string; term?: BrowseTerm } | null;
	const lifted = staged?.kind === 'term' && staged.term ? termKey(staged.term) : null;
	const t = useT();

	// This level's own answer, held while the shared query is another level's.
	const shown = useLevelSnapshot(answer, settled);
	const loaded = shown?.hits.length ?? 0;
	const detail =
		shown?.total === undefined ? undefined : t('pos_products.n_products', { count: shown.total });
	// The footer's total is this level's too (as the variations footer takes its parent's count),
	// not the live binding's, which may already be another level's.
	const total = shown?.total;
	const total$ = React.useMemo(() => (total === undefined ? NO_TOTAL$ : of(total)), [total]);
	// The query is windowed (#1221): the level asks for more as the cashier nears its end, as the
	// products grid does. A level of subcategories alone has nothing to page, and a level a child
	// is over does not own the query: neither may move it.
	const extend = useGuardedExtendLimit(actions.extendLimit, loaded, binding);
	// An end-reached while the demand is pending is armed and fired once it clears (the list
	// will not fire again for the same rows): use-armed-end-reached.
	const owned = showProducts && settled;
	const onEndReached = useArmedEndReached(extend, binding.pending$, owned);

	// Until the query answers, a row's worth of product slots is held, so the deal never waits.
	const products: (EngineRecord<'products'> | null)[] = !showProducts
		? []
		: shown === undefined
			? Array.from({ length: columns * PLACEHOLDER_ROWS }, () => null)
			: shown.hits.map((hit) => hit.record);
	// Answered with nothing to show: the way back stays in slot 0 and the empty state sits under
	// it. A level whose products are hidden by its display type is not empty.
	const isEmpty = showProducts && shown !== undefined && loaded === 0 && children.length === 0;
	const count = 1 + children.length + products.length;
	const rows = React.useMemo(
		() =>
			Array.from({ length: Math.ceil(count / columns) }, (_, row) =>
				Array.from({ length: columns }, (_, column) => row * columns + column)
			),
		[count, columns]
	);
	// The last parent is the crumb's back control; it keeps the stable back testID.
	const parents = crumb.parents.map((entry, index) =>
		index === crumb.parents.length - 1 ? { ...entry, testID: 'products-breadcrumb-back' } : entry
	) as [Crumb, ...Crumb[]];

	const renderSlot = (index: number) => {
		if (index === 0) return <ParentTermTile term={term} onPress={back} />;
		if (index <= children.length) {
			const child = children[index - 1];
			return <TermTile term={child} onPress={onOpenTerm} lifted={lifted === termKey(child)} grow />;
		}
		const record = products[index - 1 - children.length];
		if (!record) return <ProductPlaceholder />;
		return record.payload.type === 'variable' ? (
			<VariableProductTile
				record={record}
				gridFields={gridFields}
				variationsStyle={variationsStyle}
				onDrill={onDrillProduct}
				grow
			/>
		) : (
			<ProductTile record={record} gridFields={gridFields} grow />
		);
	};

	return (
		// Escape and the edge swipe go back one level, as the variations pane's do.
		<LevelBack onBack={back} testID="browse-level">
			{/* The crumb is a row of its own on the ground above the grid (drill-in.tsx): never
			    over the grid, never inside a card. */}
			<DealFade>
				<Breadcrumb
					parents={parents}
					here={crumb.here}
					detail={detail}
					autoFocus
					testID="products-breadcrumb"
				/>
			</DealFade>
			<View className="min-h-0 flex-1 px-1" testID="browse-level-surface">
				<View
					ref={slotsNode}
					className="min-h-0 flex-1"
					testID="browse-level-slots"
					onLayout={() => placeGrid(slotsNode.current as Measurable)}
				>
					<Animated.FlatList
						ref={scroller}
						className="flex-1"
						testID="browse-level-scroller"
						data={rows}
						keyExtractor={(_, rowIndex) => String(rowIndex)}
						CellRendererComponentStyle={frontRow}
						onEndReachedThreshold={END_REACHED_THRESHOLD}
						// Android detaches rows outside the viewport by default, so a tile bound below the
						// fold flew unseen; rows outside the render window still unmount.
						removeClippedSubviews={false}
						onEndReached={owned ? onEndReached : undefined}
						renderItem={({ item: row, index: rowIndex }) => (
							<View className="flex-row" style={rowIndex === 0 ? FRONT : undefined}>
								{row.map((index) =>
									index >= count ? (
										<View key={index} className="flex-1" />
									) : (
										<DealCell
											key={index}
											index={index}
											count={count}
											columns={columns}
											scroll={scroll}
										>
											{renderSlot(index)}
										</DealCell>
									)
								)}
							</View>
						)}
						ListFooterComponent={
							// Furniture, as the crumb and the footer are: it fades with the deal.
							isEmpty ? (
								<DealFade className="items-center justify-center p-4">{empty}</DealFade>
							) : undefined
						}
					/>
				</View>
				{/* No products footer under a level that shows only its subcategories. */}
				{showProducts && (
					<DealFade>
						<ProductsFooter
							collectionName="products"
							active$={binding.active$}
							total$={total$}
							sync={binding.sync}
							count={loaded}
						/>
					</DealFade>
				)}
			</View>
		</LevelBack>
	);
}
