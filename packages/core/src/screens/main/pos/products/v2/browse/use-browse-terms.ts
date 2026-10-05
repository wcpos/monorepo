import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { useDocField } from '@wcpos/query';

import { useT } from '../../../../../../contexts/translations';
import { useAllTermsBinding, useProductsCarryingTermsBinding } from '../../../../../../query';
import { useUISettings } from '../../../../contexts/ui-settings';
import { useCurrencyFormat } from '../../../../hooks/use-currency-format';
import {
	describeQuickFilter,
	normalizeFilterBar,
	type QuickFilter,
} from '../../filter-bar/filter-bar-layout';
import {
	type BrowseBy,
	type BrowseTerm,
	collectionFor,
	isHierarchical,
	isTaxonomy,
	type TaxonomySource,
} from './browse-source';
import {
	childrenOf,
	descendantIds,
	orderTerms,
	rootTerms,
	type TermLike,
	visibleTerms,
} from './term-tree';

export type BrowseTerms = {
	/** Every visible term of the source, in order; undefined until the collection has answered. */
	all: BrowseTerm[] | undefined;
	rootsOf: () => BrowseTerm[];
	childrenOf: (term: BrowseTerm) => BrowseTerm[];
	idsFor: (term: BrowseTerm) => number[];
	quickFilterFor: (term: BrowseTerm) => QuickFilter | undefined;
};

type TermRecord = { payload: TermLike & { image?: { src?: string } | null } };

const toTerm = (term: TermRecord['payload']): BrowseTerm & { kind: 'term' } => ({
	kind: 'term',
	id: term.id,
	name: term.name,
	count: term.count ?? 0,
	imageSrc: term.image?.src || undefined,
	display: term.display,
	parent: term.parent || undefined,
});

const NO_IDS: ReadonlySet<number> = new Set();

/**
 * Pure: the taxonomy records → the source's terms. Exported for its test. `knownNonEmpty`
 * undefined is an existence read that has not answered yet: the source is then unanswered too,
 * as it is before its records arrive — a zero-count term may yet be shown.
 */
export function projectTerms(
	records: TermRecord[] | undefined,
	source: TaxonomySource,
	knownNonEmpty: ReadonlySet<number> | undefined
): BrowseTerms {
	const payloads = (records ?? []).map((record) => record.payload);
	const byId = new Map(payloads.map((term) => [term.id, term]));
	const hierarchical = isHierarchical(source);
	const known = records === undefined ? undefined : knownNonEmpty;
	return {
		all:
			known === undefined
				? undefined
				: orderTerms(visibleTerms(payloads, known), hierarchical).map(toTerm),
		rootsOf: () =>
			known === undefined
				? []
				: (hierarchical
						? rootTerms(payloads, known)
						: orderTerms(visibleTerms(payloads, known), false)
					).map(toTerm),
		childrenOf: (term) =>
			known !== undefined && term.kind === 'term' && hierarchical
				? childrenOf(payloads, term.id, known).map(toTerm)
				: [],
		idsFor: (term) =>
			term.kind !== 'term'
				? []
				: hierarchical && byId.has(term.id)
					? descendantIds(payloads, term.id)
					: [term.id],
		quickFilterFor: () => undefined,
	};
}

/** Pure: the filter bar's stored items → shortcut terms, in the merchant's order. */
export function projectShortcuts(
	items: ReturnType<typeof normalizeFilterBar>,
	describe: (quickFilter: QuickFilter) => string
): BrowseTerms {
	const quickFilters = items.filter((item): item is QuickFilter => item.type === 'quick');
	const terms: BrowseTerm[] = quickFilters.map((quickFilter) => ({
		kind: 'shortcut',
		id: quickFilter.id,
		name: quickFilter.label,
		description: describe(quickFilter),
	}));
	return {
		all: terms,
		rootsOf: () => terms,
		childrenOf: () => [],
		idsFor: () => [],
		quickFilterFor: (term) =>
			term.kind === 'shortcut'
				? quickFilters.find((quickFilter) => quickFilter.id === term.id)
				: undefined,
	};
}

const NONE: BrowseTerms = {
	all: [],
	rootsOf: () => [],
	childrenOf: () => [],
	idsFor: () => [],
	quickFilterFor: () => undefined,
};

type Hit<T> = { record: T };
type ProductRecord = { payload: Partial<Record<TaxonomySource, { id?: number }[]>> };

/** One taxonomy's terms; no taxonomy (a shortcuts stage) binds nothing, in the same hook order. */
function useTaxonomyTerms(source: TaxonomySource | undefined): BrowseTerms {
	const taxonomy = source ?? 'categories';
	const binding = useAllTermsBinding(collectionFor(taxonomy), source !== undefined);
	// Read as state, never suspend: the tiles are on a stage that must not swap for a skeleton.
	// eslint-disable-next-line wcpos/no-dollar-getter-into-observable-hooks -- ObservableResource exposes a stable BehaviorSubject property, not an RxDB $-getter; exception dated 2026-10-02.
	useObservableEagerState(binding.resource.valueRef$$);
	const answer = binding.resource.valueRef$$.value;
	const hits = answer?.current.hits as Hit<TermRecord>[] | undefined;
	// The catalog recount leaves out POS-only products, so ask the local products which of the
	// zero-count terms they carry (see `visibleTerms`).
	const zeroCountIds = React.useMemo(
		() =>
			(hits ?? [])
				.filter((hit) => !((hit.record.payload.count ?? 0) > 0))
				.map((hit) => hit.record.payload.id),
		[hits]
	);
	const carrying = useProductsCarryingTermsBinding(taxonomy, zeroCountIds);
	// eslint-disable-next-line wcpos/no-dollar-getter-into-observable-hooks -- ObservableResource exposes a stable BehaviorSubject property, not an RxDB $-getter; exception dated 2026-10-02.
	useObservableEagerState(carrying.resource.valueRef$$);
	const products = carrying.resource.valueRef$$.value?.current.hits as
		Hit<ProductRecord>[] | undefined;
	// Keyed on the sorted ids, so a product write that leaves the set as it was keeps the same
	// Set and the projection is not rebuilt.
	const carriedKey = React.useMemo(() => {
		if (products === undefined) return undefined;
		const ids = new Set<number>();
		for (const hit of products)
			for (const term of hit.record.payload[taxonomy] ?? [])
				if (typeof term?.id === 'number') ids.add(term.id);
		return [...ids].sort((a, b) => a - b).join(',');
	}, [products, taxonomy]);
	const carried = React.useMemo(
		() =>
			carriedKey === undefined
				? undefined
				: new Set(carriedKey === '' ? [] : carriedKey.split(',').map(Number)),
		[carriedKey]
	);
	// No zero-count terms: the read is disabled, and its answer is that nothing needs lifting.
	// Otherwise the source is unanswered until the products have answered — a POS-only store's
	// terms are all zero-count, and must not read as empty while their read is in flight.
	const existence = zeroCountIds.length === 0 ? NO_IDS : carried;
	// A changed id set is a new read: the last answer holds meanwhile, so the stage does not
	// collapse for a frame (state set while rendering — React's "previous render" pattern).
	const [held, setHeld] = React.useState<{
		taxonomy: TaxonomySource;
		ids: ReadonlySet<number>;
	}>();
	if (existence !== undefined && (held?.ids !== existence || held.taxonomy !== taxonomy))
		setHeld({ taxonomy, ids: existence });
	const knownNonEmpty = existence ?? (held?.taxonomy === taxonomy ? held.ids : undefined);
	return React.useMemo(
		() =>
			projectTerms(
				hits?.map((hit) => hit.record),
				taxonomy,
				knownNonEmpty
			),
		[hits, taxonomy, knownNonEmpty]
	);
}

/**
 * How many terms each source would show — for the settings row's count and its dimming.
 * `undefined` until the source's collection has answered: a source that is still loading is
 * not an empty one, and the dialog can open before the browse bindings have (All products).
 */
export function useBrowseCounts(): Record<Exclude<BrowseBy, 'all'>, number | undefined> {
	const categories = useTaxonomyTerms('categories');
	const tags = useTaxonomyTerms('tags');
	const brands = useTaxonomyTerms('brands');
	const { uiSettings } = useUISettings('pos-products');
	const items = normalizeFilterBar(useDocField(uiSettings, (value) => value.filterBar));
	const answered = (terms: BrowseTerms) =>
		terms.all === undefined ? undefined : terms.rootsOf().length;
	return {
		categories: answered(categories),
		tags: answered(tags),
		brands: answered(brands),
		shortcuts: items.filter((item) => item.type === 'quick').length,
	};
}

export function useBrowseTerms(source: BrowseBy): BrowseTerms {
	// Only the active source is read (the settings dialog's counts read all three).
	const taxonomy = useTaxonomyTerms(isTaxonomy(source) ? source : undefined);
	const { uiSettings } = useUISettings('pos-products');
	const filterBar = useDocField(uiSettings, (value) => value.filterBar);
	const t = useT();
	const { format } = useCurrencyFormat();
	const shortcuts = React.useMemo(
		() =>
			projectShortcuts(normalizeFilterBar(filterBar), (quickFilter) =>
				describeQuickFilter(quickFilter, t, format)
			),
		[filterBar, t, format]
	);
	if (source === 'shortcuts') return shortcuts;
	if (isTaxonomy(source)) return taxonomy;
	return NONE;
}
