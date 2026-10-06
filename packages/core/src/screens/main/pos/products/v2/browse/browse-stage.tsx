import * as React from 'react';

import isEqual from 'lodash/isEqual';

import { PaneStack } from '@wcpos/components/pane-stack';
import type { EngineRecord } from '@wcpos/query';

import { useT } from '../../../../../../contexts/translations';
import { useQueryState } from '../../../../../../query';
import { useFirstAnswer } from '../../../../hooks/use-first-answer';
import { DealStack, type Measurable } from '../deal-stack';
import { DrillIn } from '../drill-in';
import { type BrowseBy, type BrowseTerm, termKey } from './browse-source';
import { BrowseRootGrid, TermLevelGrid } from './term-grid';
import { BrowseRootTable, TermLevelTable } from './term-table';
import { displayTypeOf } from './term-tree';
import { useAnswerOf } from './use-answer-of';
import { filtersAtBaseline, isBlankSearch, type PathEntry, useBrowsePath } from './use-browse-path';
import { useBrowseTerms } from './use-browse-terms';

import type {
	QueryStateActions,
	QueryStateOf,
	useRelationalCollectionBinding,
} from '../../../../../../query';
import type { LevelAnswer } from './level-snapshot';

type Binding = ReturnType<typeof useRelationalCollectionBinding>;
type DrillHandler = (record: EngineRecord<'products'> | null, target?: Measurable) => void;
type TableConfig = React.ComponentProps<typeof TermLevelTable>['tableConfig'];
/**
 * The product drilled at `depth`, under the path entry it opened in, for the search and source
 * it opened under — and, at the root, the filters (see `filtersHold`).
 */
type ProductDrill = {
	kind: 'product';
	record: EngineRecord<'products'>;
	depth: number;
	under: PathEntry | undefined;
	search: string;
	source: BrowseBy;
	filters: QueryStateOf<'products'>['filters'];
	target?: Measurable;
};
/** A drill as the press made it: stamped with where the stage is on the render that follows. */
type PressedDrill = { kind: 'product'; record: EngineRecord<'products'>; target?: Measurable };
// By identity: DealStack re-arms whenever `detail !== staged`, so a level's detail is the stored
// path entry or the drill object itself, never a fresh literal.
type Detail = PathEntry | ProductDrill;

export type BrowseStageProps = {
	source: Exclude<BrowseBy, 'all'>;
	viewMode: 'grid' | 'table';
	/**
	 * Today's products grid or table, wired to the given drill handler: the products a narrowed
	 * query (a search, a pill) shows over an empty path (the screen mounts the stage whatever the
	 * query, so a search typed in a level gathers it home and shows these at the root).
	 */
	renderProducts: (onDrill: DrillHandler) => React.ReactNode;
	/** index.tsx's `noDataMessage`, for a level that answered with nothing. */
	empty: React.ReactNode;
	variationsStyle: string;
	stockStatus?: string;
	/** The root products binding, state, actions and table config, as index.tsx hands its own. */
	binding: Binding;
	state: { sort: QueryStateOf<'products'>['sort'] };
	actions: Pick<QueryStateActions<'products'>, 'setSort' | 'extendLimit' | 'setFilter'>;
	tableConfig: TableConfig;
	/** So the screen can set the filter bar's level while a product is drilled here. */
	onDrilledChange: (drilled: boolean) => void;
	/** index.tsx's `initialFilters`: the baseline a query must be at for the term set to show. */
	initialFilters: Record<string, unknown>;
};

function useSourceLabel(source: Exclude<BrowseBy, 'all'>): string {
	const t = useT();
	switch (source) {
		case 'categories':
			return t('pos_products.browse_categories');
		case 'tags':
			return t('pos_products.browse_tags');
		case 'brands':
			return t('pos_products.browse_brands');
		default:
			return t('pos_products.browse_shortcuts');
	}
}

/**
 * The products stage with a browse source on. Level 0 is the term set; each entry of the path
 * is a level dealt (grid) or pushed (table) over the one before; a product drilled at the
 * deepest level is its variations, over that level. The path and the product drill both fall
 * away when the query moves (search, a pill, Clear filters) — see use-browse-path.
 */
export function BrowseStage(props: BrowseStageProps) {
	const { source, viewMode, binding, onDrilledChange } = props;
	const terms = useBrowseTerms(source);
	const { path, enter, backTo } = useBrowsePath(source, terms);
	const state = useQueryState<'products'>();
	// The product drill remembers its depth, the entry it opened under and the search it opened
	// under (the existing rule).
	const [drill, setDrill] = React.useState<ProductDrill | PressedDrill | null>(null);
	// A press records only the product (so the handler needs nothing from the render and stays
	// stable); the render that follows stamps where the stage is — React redoes that render
	// before it commits, so no unstamped drill reaches a stack.
	if (drill && !('depth' in drill))
		setDrill({
			...drill,
			depth: path.length,
			under: path[path.length - 1],
			search: state.search,
			source,
			filters: state.filters,
		});
	// Searches compare as the query compiler reads them (trimmed): a space typed after the drill
	// is the same query.
	const sameSearch = (left: string, right: string) => left.trim() === right.trim();
	// A drill from the root (a pill- or search-displaced root) holds only while the filters it
	// opened under do: Clear filters brings the term set back, never under a still-open drill.
	// Inside a level the entry's identity (`under`) already covers this — a filter moved there
	// drops the level — and a re-projection under a live level (a child term added on the
	// server) moves the filters without the cashier doing anything, which must not close it.
	const filtersHold = (opened: ProductDrill) =>
		opened.depth > 0 || isEqual(opened.filters, state.filters);
	// Shown only for the source, depth, search and very path entry it opened under (`under`, by
	// identity) — judged in the same render, so a path dropped by a pill or Clear filters and a
	// new one opened at the same depth never brings the old drill back for a frame.
	const drilled =
		drill &&
		'depth' in drill &&
		drill.source === source &&
		sameSearch(drill.search, state.search) &&
		drill.depth === path.length &&
		path[drill.depth - 1] === drill.under &&
		filtersHold(drill)
			? drill
			: null;
	// A layout effect: the filter bar's level and the staged surface commit in the same frame.
	React.useLayoutEffect(() => onDrilledChange(drilled !== null), [drilled, onDrilledChange]);
	// An unmounting stage (Browse by back to All products, or the source changes) hands the
	// filter bar's level back before paint.
	React.useLayoutEffect(() => () => onDrilledChange(false), [onDrilledChange]);
	// A drill whose search, source, entry or (at the root) filters have moved is forgotten — not
	// merely hidden: restoring the same search later must show the results, not the old
	// variations. Dropped while rendering (React's "previous render" pattern, as index.tsx drops
	// its own drill).
	if (
		drill &&
		'depth' in drill &&
		(!sameSearch(drill.search, state.search) ||
			drill.source !== source ||
			path[drill.depth - 1] !== drill.under ||
			!filtersHold(drill))
	)
		setDrill(null);
	// Stable: it is baked into the tiles' component identity through renderProducts, and a new
	// handler per keystroke would remount every tile under the search.
	const drillProduct = React.useCallback<DrillHandler>(
		(record, target) => setDrill(record ? { kind: 'product', record, target } : null),
		[]
	);
	const closeDrill = React.useCallback(() => drillProduct(null), [drillProduct]);

	// The products answer as state: a level never suspends (a tile swapped for a skeleton
	// mid-deal would lose its place). Attributed to its query: `binding.result$` is a new
	// observable per compiled query, and useAnswerOf pairs each emission with the observable it
	// came from — `undefined` while the projection on stage has no answer of its own.
	// A level's total is that same answer's `count`: the local rows matching its query before
	// the window (the till shows local products). Never `binding.total$` — its coverage verdict
	// prefers the whole collection's census, which is the catalogue's size at every level.
	const liveResult = useAnswerOf(binding.result$);
	const answer = React.useMemo<LevelAnswer | undefined>(
		() =>
			liveResult
				? { hits: liveResult.hits as unknown as LevelAnswer['hits'], total: liveResult.count }
				: undefined,
		[liveResult]
	);
	// A table level's DataTable reads the root resource and suspends until it has answered
	// once; after that the resource keeps its answer across every re-projection. So a level is
	// not pushed before the root products' first answer (a cold open): the pane follows it.
	const rootAnswered = useFirstAnswer(binding.resource);
	const levelsHeld = viewMode === 'table' && !rootAnswered;

	const t = useT();
	const rootLabel = useSourceLabel(source);
	const labelOf = (term: BrowseTerm) =>
		term.kind === 'all' ? t('pos_products.browse_all_products') : term.name;
	// A live entry's term as the source has it NOW (a rename follows); an entry no longer on the
	// path (its level is gathering) keeps its snapshot.
	const currentOf = (entry: PathEntry, depth: number): BrowseTerm =>
		(path[depth] === entry && terms.all?.find((known) => termKey(known) === termKey(entry.term))) ||
		entry.term;
	// Each entry's last live child set, so a gathering level keeps the tiles it was dealt with.
	// A cache keyed by entry identity, not render state: it is only read back for an entry that
	// has left the path, whose live children no longer exist to be read.
	const [childrenSeen] = React.useState(() => new WeakMap<PathEntry, BrowseTerm[]>());
	const childrenFor = (entry: PathEntry, depth: number, term: BrowseTerm): BrowseTerm[] => {
		if (path[depth] === entry) {
			const live = terms.childrenOf(term);
			childrenSeen.set(entry, live);
			return live;
		}
		return childrenSeen.get(entry) ?? [];
	};

	// Every move of the path closes the product drill: a stale drill at a depth the path returns
	// to would otherwise reappear.
	// …and opens the term at the depth of the level it was tapped on, so a second tap while the
	// first level is not yet on stage (a cold table, a deal in flight) opens the term tapped —
	// never one nested under the other.
	const openTerm = React.useCallback(
		(term: BrowseTerm, target: Measurable | undefined, depth: number) => {
			setDrill(null);
			enter(term, target, depth);
		},
		[enter]
	);
	const openRootTerm = React.useCallback(
		(term: BrowseTerm, target?: Measurable) => openTerm(term, target, 0),
		[openTerm]
	);
	const goBackTo = React.useCallback(
		(depth: number) => {
			setDrill(null);
			backTo(depth);
		},
		[backTo]
	);
	const goRoot = React.useCallback(() => goBackTo(0), [goBackTo]);
	// One array per projection, so the root grid's and table's memos hold across query changes.
	const roots = React.useMemo(() => terms.rootsOf(), [terms]);
	// A query narrowed past its baseline over an empty path has displaced the term set — a search,
	// or a pill or chip the cashier pressed (a level they left that way, a stock toggle): the
	// products of that query show, exactly as the filter bar reads, never the term tiles over a
	// filtered query. Clear filters (or clearing the search) brings the term set back.
	const displaced =
		path.length === 0 &&
		(!isBlankSearch(state.search) || !filtersAtBaseline(state.filters, props.initialFilters));

	// What is on stage at `depth`: the next path entry, or the product drilled here — the stored
	// objects themselves (identity, see Detail).
	const detailAt = (depth: number): Detail | null =>
		levelsHeld ? null : (path[depth] ?? (drilled && drilled.depth === depth ? drilled : null));
	// The crumb's ancestors above a level: the source, then the STAGED chain above it — the
	// entries each stack has on stage, handed down the recursion, never `path.slice(…)`: while a
	// level gathers after the path was cut, the live path is already shorter than the crumb.
	const crumbParentsFor = (chain: PathEntry[]) => [
		{ label: rootLabel, onPress: goRoot },
		...chain.map((entry, index) => ({
			label: labelOf(currentOf(entry, index)),
			onPress: () => goBackTo(index + 1),
		})),
	];
	// A product drilled inside a level: the level's own entry is the last crumb parent, and
	// pressing it closes the drill. At the root (a displaced root) it is the default crumb.
	const drillParentsFor = (chain: PathEntry[]) =>
		chain.length === 0
			? undefined
			: [
					...crumbParentsFor(chain.slice(0, -1)),
					{
						label: labelOf(currentOf(chain[chain.length - 1], chain.length - 1)),
						onPress: closeDrill,
					},
				];

	const renderRoot = () =>
		viewMode === 'grid' ? (
			<BrowseRootGrid
				terms={roots}
				onOpen={openRootTerm}
				binding={binding}
				settled={path.length === 0}
			/>
		) : (
			<BrowseRootTable
				terms={roots}
				onOpen={openRootTerm}
				binding={binding}
				settled={path.length === 0}
			/>
		);

	const renderTerm = (chain: PathEntry[]) => {
		const depth = chain.length;
		const entry = chain[depth - 1];
		// A live level renders the term as the source has it NOW (a rename, a changed display type
		// or count); only a level gathering after the path was cut keeps its entry's snapshot.
		const term = currentOf(entry, depth - 1);
		const crumb = { parents: crumbParentsFor(chain.slice(0, -1)), here: labelOf(term) };
		// The query is this level's own only while it is the deepest AND still on the path (a
		// product drill over it does not move the products query; a level gathering after the
		// path was truncated is neither, and holds its snapshot).
		const settled = depth === path.length && path[depth - 1] === entry;
		// All products is a level with no children: the whole catalogue under the crumb, its tile
		// in slot 0 of the deal. A shortcut has no children either.
		const display = term.kind === 'term' ? displayTypeOf(term) : 'products';
		// A level still on the path reads its children from the source as it is now; a level
		// gathering after the path was cut (deleted/reparented term, source sync) keeps the child
		// set it was dealt with — the tiles travelling home must be the tiles that came out.
		const children = display === 'products' ? [] : childrenFor(entry, depth - 1, term);
		const showProducts = display !== 'subcategories' || children.length === 0;
		// The grid's and the table's level take the same props (`children` is the child terms).
		const level = {
			term,
			children,
			answer,
			settled,
			showProducts,
			crumb,
			back: () => goBackTo(depth - 1),
			onOpenTerm: (child: BrowseTerm, target?: Measurable) => openTerm(child, target, depth),
			onDrillProduct: drillProduct,
			variationsStyle: props.variationsStyle,
			binding,
			empty: props.empty,
		};
		// Keyed by the term: a stack whose detail jumps from one term to another at the same depth
		// (a sibling tapped before the gather ended) must not keep the first term's held answer.
		return viewMode === 'grid' ? (
			<TermLevelGrid key={termKey(term)} {...level} actions={props.actions} />
		) : (
			<TermLevelTable
				key={termKey(term)}
				{...level}
				state={props.state}
				actions={props.actions}
				tableConfig={props.tableConfig}
			/>
		);
	};

	// Level `depth` (0 = the root) with whatever is dealt over it. `chain` is the staged entries
	// from the root down to this level (its last element is the term this level shows) — handed
	// down from each stack's STAGED detail, not read from the path: a stack keeps its detail on
	// stage for the gather after the path has already been truncated, and a level rendered from
	// the path in that window would be rendering `undefined`, with a crumb missing its middle.
	const renderLevel = (chain: PathEntry[]): React.ReactNode => {
		const depth = chain.length;
		const detail = detailAt(depth);
		const content =
			depth === 0
				? displaced
					? props.renderProducts(drillProduct)
					: renderRoot()
				: renderTerm(chain);
		const renderDetail = (staged: Detail) =>
			staged.kind === 'term' ? (
				renderLevel([...chain, staged])
			) : (
				<DrillIn
					parent={staged.record}
					back={closeDrill}
					stockStatus={props.stockStatus}
					tiles={viewMode === 'grid'}
					parents={drillParentsFor(chain)}
				/>
			);
		const testID = depth === 0 ? 'products-pane-stack' : `browse-stack-${depth}`;
		return viewMode === 'grid' ? (
			<DealStack<Detail>
				testID={testID}
				detail={detail}
				target={detail?.target}
				renderDetail={renderDetail}
			>
				{content}
			</DealStack>
		) : (
			<PaneStack<Detail>
				testID={testID}
				detail={detail}
				paneClassName="bg-background"
				renderDetail={renderDetail}
			>
				{content}
			</PaneStack>
		);
	};

	return <>{renderLevel([])}</>;
}
