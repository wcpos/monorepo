/**
 * The WooCommerce shop's reading of a product taxonomy, as pure functions over the local term
 * records: ordered by the term's menu_order then name, empty terms hidden
 * (`woocommerce_product_subcategories_hide_empty`), a parent including its descendants
 * (`WP_Tax_Query` `include_children`), and the per-term display type.
 */
export type TermLike = {
	id: number;
	name: string;
	parent?: number;
	menu_order?: number;
	count?: number;
	display?: string;
};

export type DisplayType = 'products' | 'subcategories' | 'both';

const byName = (a: TermLike, b: TermLike) =>
	a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export function orderTerms<T extends TermLike>(terms: T[], hierarchical: boolean): T[] {
	return [...terms].sort((a, b) =>
		hierarchical ? (a.menu_order ?? 0) - (b.menu_order ?? 0) || byName(a, b) : byName(a, b)
	);
}

/**
 * WooCommerce's `count` is the catalog recount, which leaves out products hidden from the
 * catalog — the POS-only products a till sells. So a zero-count term stays if a synced product
 * carries it (`knownNonEmpty`, from one local products query for the zero-count ids), and a
 * parent stays whenever a descendant does: the shop's recount already folds descendants into a
 * parent's count (`_wc_term_recount`), so the only parent this lifts is one whose branch holds
 * nothing but POS-only products — and hiding it would make that branch unreachable.
 */
export function visibleTerms<T extends TermLike>(
	terms: T[],
	knownNonEmpty?: ReadonlySet<number>
): T[] {
	const byId = new Map(terms.map((term) => [term.id, term]));
	const visible = new Set<number>();
	for (const term of terms) {
		if (!((term.count ?? 0) > 0 || knownNonEmpty?.has(term.id))) continue;
		// The term and every ancestor; a cycle ends where it started.
		for (
			let cursor: TermLike | undefined = term;
			cursor && !visible.has(cursor.id);
			cursor = cursor.parent ? byId.get(cursor.parent) : undefined
		)
			visible.add(cursor.id);
	}
	return terms.filter((term) => visible.has(term.id));
}

export function rootTerms<T extends TermLike>(
	terms: T[],
	knownNonEmpty?: ReadonlySet<number>
): T[] {
	const ids = new Set(terms.map((term) => term.id));
	return orderTerms(
		visibleTerms(terms, knownNonEmpty).filter((term) => !term.parent || !ids.has(term.parent)),
		true
	);
}

export function childrenOf<T extends TermLike>(
	terms: T[],
	parentId: number,
	knownNonEmpty?: ReadonlySet<number>
): T[] {
	return orderTerms(
		visibleTerms(terms, knownNonEmpty).filter((term) => term.parent === parentId),
		true
	);
}

export function descendantIds(terms: TermLike[], id: number): number[] {
	const children = new Map<number, number[]>();
	for (const term of terms) {
		if (!term.parent) continue;
		children.set(term.parent, [...(children.get(term.parent) ?? []), term.id]);
	}
	const seen = new Set<number>([id]);
	const queue = [id];
	while (queue.length > 0) {
		for (const child of children.get(queue.shift() as number) ?? []) {
			if (seen.has(child)) continue;
			seen.add(child);
			queue.push(child);
		}
	}
	return [...seen];
}

export function displayTypeOf(term: TermLike): DisplayType {
	return term.display === 'products' || term.display === 'subcategories' ? term.display : 'both';
}
