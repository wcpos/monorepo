import * as React from 'react';
import { View } from 'react-native';

import { useObservableState } from 'observable-hooks';
import { of } from 'rxjs';

import { Breadcrumb } from '@wcpos/components/breadcrumb';
import * as VirtualizedList from '@wcpos/components/virtualized-list';
import type { EngineRecord } from '@wcpos/query';

import { useT } from '../../../../../../contexts/translations';
import { DataTable } from '../../../../components/data-table/v2';
import { TableSurface } from '../../../../components/data-table/surface';
import { cellsForRow } from '../../index';
import { ProductsFooter } from '../footer';
import { LevelBack } from '../level-back';
import { ProductRow } from '../rows/product-row';
import { VariableProductRow } from '../rows/variable-product-row';
import { type BrowseTerm, termKey } from './browse-source';
import { type LevelAnswer, useLevelSnapshot } from './level-snapshot';
import { TermRow } from './term-row';

import type {
	QueryStateActions,
	QueryStateOf,
	useRelationalCollectionBinding,
} from '../../../../../../query';

type Binding = ReturnType<typeof useRelationalCollectionBinding>;
type Crumb = { label: string; onPress: () => void; testID?: string };

const ALL: BrowseTerm = { kind: 'all' };

/** The term set at the root of a browse mode as rows of the table card: All products first, then the terms. */
export function BrowseRootTable({
	terms,
	onOpen,
	binding,
}: {
	terms: BrowseTerm[];
	onOpen: (term: BrowseTerm) => void;
	/** The root products binding: the till's footer under the term set. */
	binding?: Binding;
}) {
	const rows = React.useMemo(() => [ALL, ...terms], [terms]);
	return (
		// The rows sit on the same card as the products table (no header row: a term has one cell);
		// the footer is the caption row on the ground beneath it, as the products table's is.
		<View className="flex h-full flex-col" testID="browse-root">
			<TableSurface testID="browse-root-rows">
				<VirtualizedList.Root style={{ flex: 1 }}>
					<VirtualizedList.List
						data={rows}
						keyExtractor={(term) => termKey(term)}
						renderItem={({ item }) => (
							<VirtualizedList.Item>
								<TermRow term={item} onPress={onOpen} />
							</VirtualizedList.Item>
						)}
						estimatedItemSize={60}
					/>
				</VirtualizedList.Root>
			</TableSurface>
			{binding && <BrowseRootFooter binding={binding} />}
		</View>
	);
}

/**
 * The till's footer under a term set, as `BrowseRootGrid`'s (term-grid.tsx): the catalogue
 * total, the tax basis line and the sync button. The loaded window means nothing over terms,
 * so the count is the total; with no total to vouch for one, the loaded rows are all there is.
 */
function BrowseRootFooter({ binding }: { binding: Binding }) {
	const { total$, result$ } = binding;
	const total = useObservableState(total$, null);
	const loaded = useObservableState(result$, undefined)?.hits.length ?? 0;
	return (
		<ProductsFooter
			collectionName="products"
			active$={binding.active$}
			total$={total$}
			sync={binding.sync}
			count={total ?? loaded}
		/>
	);
}

/** A product as the products table has it (index.tsx's `ProductRow`). */
type ProductHit = { record: EngineRecord<'products'> };
// The level's rows on the one table: its child terms, then its products — or, until the level
// has an answer of its own, slots held for them.
type LevelHit = LevelAnswer['hits'][number] & { id?: string };
type TermItem = { id: string; term: BrowseTerm };
type HeldItem = { id: string; held: true };
type LevelRow = LevelHit | TermItem | HeldItem;
type TableConfig = NonNullable<React.ComponentProps<typeof DataTable<ProductHit>>['tableConfig']>;
type TableRow = Parameters<NonNullable<TableConfig['getRowCanExpand']>>[0];

// Slots held for a cold level's products under its child rows: a pane's worth of shape, so the
// rows that land do not reflow it. Plain rows, no shimmer — a pushed pane carries no skeleton.
const SKELETON_PRODUCT_ROWS = 4;
const HELD: HeldItem[] = Array.from({ length: SKELETON_PRODUCT_ROWS }, (_, index) => ({
	id: `held-${index}`,
	held: true,
}));
const NO_TOTAL$ = of(null);
// A covered level does not own the shared query: its scroll must not move it.
const NO_EXTEND = () => {};

// A product keeps the id the products table gives it (`hit.id`), so an inline expansion
// (keyed by row id in index.tsx's `expandedRef`) is the same row's here.
const rowId = (row: LevelRow) => ('record' in row ? (row.id ?? row.record.uuid) : row.id);
const isProduct = (row: LevelRow): row is LevelHit => 'record' in row;
// The list recycles by type: a term row, a held slot and each product type are their own.
const itemType = ({ original: row }: { original: LevelRow }): string =>
	'term' in row ? 'term' : 'held' in row ? 'held' : (row.record.payload.type ?? 'product');

/** A product that has not arrived yet: its row is held, in a row's own height. */
function RowPlaceholder() {
	return <View className="min-h-row border-border border-b" aria-busy testID="row-placeholder" />;
}

/**
 * One term's contents as a pane: the crumb above, its child terms as the first rows of the
 * products table, then its products. The pane shows its own answer (`useLevelSnapshot`), held
 * while a child pane is pushed over it and while the query gathers its set on the way back, so
 * the rows travelling home are the rows that came out. All products is this same pane, with no
 * children. The rows travel with their pane; none animates on its own.
 */
export function TermLevelTable({
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
	state,
	actions,
	tableConfig,
	empty,
}: {
	/** The level's term (the crumb's `here` names it). */
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
	/** Escape / edge swipe; the crumb's last parent is the same step. */
	back: () => void;
	onOpenTerm: (term: BrowseTerm) => void;
	onDrillProduct: (record: EngineRecord<'products'>) => void;
	variationsStyle: string;
	/** The root products binding, state and actions, as index.tsx hands its DataTable. */
	binding: Binding;
	state: { sort: QueryStateOf<'products'>['sort'] };
	actions: Pick<QueryStateActions<'products'>, 'setSort' | 'extendLimit' | 'setFilter'>;
	/** index.tsx's products `tableConfig`: inline variations read its `meta` (expanded rows). */
	tableConfig: TableConfig;
	/** index.tsx's `noDataMessage`: the level answered with no products and has no child terms. */
	empty: React.ReactNode;
}) {
	const t = useT();
	// This pane's own answer, held while the shared query is another level's (level-snapshot.ts).
	const shown = useLevelSnapshot(answer, settled);
	const loaded = shown?.hits.length ?? 0;
	const detail =
		shown?.total === undefined ? undefined : t('pos_products.n_products', { count: shown.total });
	// The footer's total is this pane's too (as the variations footer takes its parent's count),
	// not the live binding's, which may already be another level's; pending until it has one.
	const total = shown?.total;
	const total$ = React.useMemo(() => (total === undefined ? NO_TOTAL$ : of(total)), [total]);
	// The table's footer counts the pane's own rows, never the live binding's window.
	const Footer = React.useCallback(
		(props: React.ComponentProps<typeof ProductsFooter>) => (
			<ProductsFooter {...props} total$={total$} count={loaded} />
		),
		[total$, loaded]
	);
	// The query is windowed (#1221): the table extends it as the cashier nears the end (its own
	// guard, on the live rows). A pane a child is over does not own the query: it may not move it.
	const tableActions = React.useMemo(
		() => (settled ? actions : { ...actions, extendLimit: NO_EXTEND }),
		[actions, settled]
	);
	// The child terms lead the table's rows, so they scroll with the products under them.
	const rows = React.useMemo<LevelRow[]>(
		() => [
			...children.map((child) => ({ id: `browse:${termKey(child)}`, term: child })),
			...(shown === undefined ? HELD : shown.hits),
		],
		[children, shown]
	);
	const config = React.useMemo(
		() =>
			({
				...tableConfig,
				data: rows,
				getRowId: rowId,
				// Only a product expands (inline variations); a term row or a held slot never does.
				getRowCanExpand: (row: { original: LevelRow }) =>
					isProduct(row.original) && !!tableConfig.getRowCanExpand?.(row as unknown as TableRow),
			}) as unknown as TableConfig,
		[tableConfig, rows]
	);
	// The last parent is the crumb's back control; it keeps the stable back testID.
	const parents = crumb.parents.map((entry, index) =>
		index === crumb.parents.length - 1 ? { ...entry, testID: 'products-breadcrumb-back' } : entry
	) as [Crumb, ...Crumb[]];

	return (
		// Escape and the edge swipe go back one level, as the variations pane's do.
		<LevelBack onBack={back} testID="browse-level">
			{/* The crumb is a row of its own on the ground above the table (drill-in.tsx): never
			    over the rows, never inside the card. */}
			<Breadcrumb
				parents={parents}
				here={crumb.here}
				detail={detail}
				autoFocus
				testID="products-breadcrumb"
			/>
			<View className="min-h-0 flex-1">
				{showProducts ? (
					<DataTable<ProductHit>
						id="pos-products"
						persistSort={false}
						collectionName="products"
						binding={binding}
						resource={binding.resource}
						tableConfig={config}
						sort={state.sort}
						actions={tableActions}
						active$={binding.active$}
						total$={total$}
						sync={binding.sync}
						cellsForRow={cellsForRow}
						// The rows are never empty under child terms; with neither, the empty state (and
						// its Clear filters) sits in the table under the crumb.
						noDataMessage={empty as React.ReactElement}
						renderItem={({ item, index, table }) => {
							const row = item.original as LevelRow;
							return (
								<VirtualizedList.Item>
									{'term' in row ? (
										<TermRow term={row.term} onPress={onOpenTerm} />
									) : 'held' in row ? (
										<RowPlaceholder />
									) : row.record.payload.type === 'variable' ? (
										<VariableProductRow
											item={item}
											index={index}
											table={table}
											variationsStyle={variationsStyle}
											onDrill={onDrillProduct}
										/>
									) : (
										<ProductRow item={item} />
									)}
								</VirtualizedList.Item>
							);
						}}
						estimatedItemSize={100}
						TableFooterComponent={Footer}
						getItemType={itemType}
					/>
				) : (
					// Subcategories only: the child terms as the root's rows are, no product columns,
					// no products footer, nothing to page.
					<TableSurface>
						<VirtualizedList.Root style={{ flex: 1 }}>
							<VirtualizedList.List
								data={children}
								keyExtractor={(child) => termKey(child)}
								renderItem={({ item }) => (
									<VirtualizedList.Item>
										<TermRow term={item} onPress={onOpenTerm} />
									</VirtualizedList.Item>
								)}
								estimatedItemSize={60}
							/>
						</VirtualizedList.Root>
					</TableSurface>
				)}
			</View>
		</LevelBack>
	);
}
