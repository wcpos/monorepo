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

/** Pure: the taxonomy records → the source's terms. Exported for its test. */
export function projectTerms(
	records: TermRecord[] | undefined,
	source: TaxonomySource,
	knownNonEmpty: ReadonlySet<number> = NO_IDS
): BrowseTerms {
	const payloads = (records ?? []).map((record) => record.payload);
	const byId = new Map(payloads.map((term) => [term.id, term]));
	const hierarchical = isHierarchical(source);
	return {
		all:
			records === undefined
				? undefined
				: orderTerms(visibleTerms(payloads, knownNonEmpty), hierarchical).map(toTerm),
		rootsOf: () =>
			(hierarchical
				? rootTerms(payloads, knownNonEmpty)
				: orderTerms(visibleTerms(payloads, knownNonEmpty), false)
			).map(toTerm),
		childrenOf: (term) =>
			term.kind === 'term' && hierarchical
				? childrenOf(payloads, term.id, knownNonEmpty).map(toTerm)
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

function useTaxonomyTerms(source: TaxonomySource): BrowseTerms {
	const binding = useAllTermsBinding(collectionFor(source));
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
	const carrying = useProductsCarryingTermsBinding(source, zeroCountIds);
	// eslint-disable-next-line wcpos/no-dollar-getter-into-observable-hooks -- ObservableResource exposes a stable BehaviorSubject property, not an RxDB $-getter; exception dated 2026-10-02.
	useObservableEagerState(carrying.resource.valueRef$$);
	const products = carrying.resource.valueRef$$.value?.current.hits as
		Hit<ProductRecord>[] | undefined;
	const knownNonEmpty = React.useMemo(() => {
		const ids = new Set<number>();
		for (const hit of products ?? [])
			for (const term of hit.record.payload[source] ?? [])
				if (typeof term?.id === 'number') ids.add(term.id);
		return ids;
	}, [products, source]);
	return React.useMemo(
		() =>
			projectTerms(
				hits?.map((hit) => hit.record),
				source,
				knownNonEmpty
			),
		[hits, source, knownNonEmpty]
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
	// Hooks are unconditional: every source's data is read; only one is projected.
	const categories = useTaxonomyTerms('categories');
	const tags = useTaxonomyTerms('tags');
	const brands = useTaxonomyTerms('brands');
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
	if (isTaxonomy(source)) return { categories, tags, brands }[source];
	return NONE;
}
