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
import { useAnswerOf } from './use-answer-of';

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

type TaxonomyTermsOptions = {
	/** Read the till's resident terms — the settings dialog's counts (see `useAllTermsBinding`). */
	residentsOnly?: boolean;
	/** The products baseline: without it, only an in-stock product lifts a zero-count term. */
	showOutOfStock?: boolean;
};

/** One taxonomy's terms; no taxonomy (a shortcuts stage) binds nothing, in the same hook order. */
function useTaxonomyTerms(
	source: TaxonomySource | undefined,
	{ residentsOnly = false, showOutOfStock = false }: TaxonomyTermsOptions = {}
): BrowseTerms {
	const taxonomy = source ?? 'categories';
	const binding = useAllTermsBinding(collectionFor(taxonomy), source !== undefined, {
		residentsOnly,
	});
	// Read as state, never suspend: the tiles are on a stage that must not swap for a skeleton.
	// THIS collection's answer: a source switch is unanswered until its own query emits, never
	// the previous taxonomy's records projected as the new source.
	const answer = useAnswerOf(binding.result$)?.hits as Hit<TermRecord>[] | undefined;
	// A cold collection answers its empty local rows at once, before its refresh has landed: no
	// terms is not an answer while the demand is pending. Once it settles — met, or failed
	// offline — an empty answer is one; a disabled binding is never pending. Local rows are shown
	// while a re-declaration is pending, so a warm stage does not collapse on a refresh.
	// eslint-disable-next-line wcpos/no-dollar-getter-into-observable-hooks -- QueryBinding.pending$ is the demand's stable BehaviorSubject, not an RxDB $-getter; exception dated 2026-10-06.
	const pending = useObservableEagerState(binding.pending$);
	const hits = pending && answer?.length === 0 ? undefined : answer;
	// The catalog recount leaves out POS-only products, so ask the local products which of the
	// zero-count terms they carry (see `visibleTerms`).
	const zeroCountIds = React.useMemo(
		() =>
			(hits ?? [])
				.filter((hit) => !((hit.record.payload.count ?? 0) > 0))
				.map((hit) => hit.record.payload.id),
		[hits]
	);
	const carrying = useProductsCarryingTermsBinding(taxonomy, zeroCountIds, { showOutOfStock });
	// THIS id set's answer (a disabled read emits its empty answer on subscribe).
	const products = useAnswerOf(carrying.result$)?.hits as Hit<ProductRecord>[] | undefined;
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
	// The same id set re-read (the stock baseline changed, say): the last answer for THAT set
	// holds meanwhile, so the stage does not collapse for a frame (state set while rendering —
	// React's "previous render" pattern). A CHANGED id set is pending, not held: the last answer
	// is for other ids, and a term that has just dropped to zero count is absent from it — served
	// as known, the term would read as deleted and drop an open path for good. Only a products
	// read's own answer is held: the disabled read's "nothing to lift" says nothing about
	// zero-count terms, and holding it would hide them all on a POS-only store's first load.
	const zeroCountKey = [...zeroCountIds].sort((a, b) => a - b).join(',');
	const [held, setHeld] = React.useState<{
		taxonomy: TaxonomySource;
		key: string;
		ids: ReadonlySet<number>;
	}>();
	if (carried !== undefined && zeroCountIds.length > 0)
		if (held?.ids !== carried || held.taxonomy !== taxonomy || held.key !== zeroCountKey)
			setHeld({ taxonomy, key: zeroCountKey, ids: carried });
	const knownNonEmpty =
		existence ?? (held?.taxonomy === taxonomy && held.key === zeroCountKey ? held.ids : undefined);
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
 * Resident terms only: opening the dialog pulls nothing (the reference seed lane keeps the
 * terms current, and the stage's own binding refreshes the source it shows) — except a source
 * with no residents, which is pulled once and reads unanswered until that pull settles, so a
 * fresh till does not dim every source as empty.
 */
export function useBrowseCounts(): Record<Exclude<BrowseBy, 'all'>, number | undefined> {
	const { uiSettings } = useUISettings('pos-products');
	const showOutOfStock = useDocField(uiSettings, (value) => value.showOutOfStock);
	const options = { residentsOnly: true, showOutOfStock };
	const categories = useTaxonomyTerms('categories', options);
	const tags = useTaxonomyTerms('tags', options);
	const brands = useTaxonomyTerms('brands', options);
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
	const { uiSettings } = useUISettings('pos-products');
	const showOutOfStock = useDocField(uiSettings, (value) => value.showOutOfStock);
	// Only the active source is read (the settings dialog's counts read all three).
	const taxonomy = useTaxonomyTerms(isTaxonomy(source) ? source : undefined, { showOutOfStock });
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
