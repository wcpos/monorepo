import { v4 as uuidv4 } from 'uuid';
import * as z from 'zod';

/**
 * A quick filter is a merchant-configured button that narrows the POS product list
 * in one tap. The shape lives here — not in the settings form — because the form is
 * only the FIRST consumer: the buttons themselves, and the query they translate to,
 * are rendered elsewhere and must agree on the same contract.
 *
 * `value` carries whatever the kind needs, always as a string so the setting stays
 * flat and JSON-portable:
 *   category / tag / brand → the taxonomy term id
 *   stock_status           → the status slug (`instock`, `outofstock`, `onbackorder`)
 *   search                 → the search term
 *   featured / on_sale     → empty; the kind IS the filter
 */
export const QUICK_FILTER_KINDS = [
	'category',
	'tag',
	'brand',
	'featured',
	'on_sale',
	'stock_status',
	'search',
] as const;

export type QuickFilterKind = (typeof QUICK_FILTER_KINDS)[number];

/** Kinds that carry no value — the kind alone is the whole filter. */
export const VALUELESS_QUICK_FILTER_KINDS: readonly QuickFilterKind[] = ['featured', 'on_sale'];

export const quickFilterSchema = z.object({
	id: z.string(),
	label: z.string(),
	kind: z.enum(QUICK_FILTER_KINDS),
	value: z.string(),
});

export type QuickFilter = z.infer<typeof quickFilterSchema>;

/**
 * Quick filters are reordered and removed by identity, not by index, so each one is
 * minted with a stable id when it is added.
 */
export const createQuickFilterId = (): string => uuidv4();
