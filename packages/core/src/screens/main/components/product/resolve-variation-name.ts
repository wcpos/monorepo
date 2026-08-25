import { sanitizeVariationAttributesRead } from '@wcpos/query/collection-map';

/**
 * The display name for a variation row, composed from its OWN attributes.
 *
 * # Why this is not just `payload.name`
 *
 * WooCommerce stores a variation's `post_title` from `generate_product_title()`, which renders
 * `"<Parent> - <attrs>"` below three attributes and **just `"<Parent>"` at three or more** — a
 * deliberate storage decision to keep post titles short. WCPOS plugin 1.10.0 serialized variations
 * through the PRODUCTS controller, so `payload.name` is that title: on any variable product with 3+
 * variation attributes, EVERY row renders the identical string and the cashier cannot tell them
 * apart. Plugin 1.10.1 serves `wc_get_formatted_variation()` instead, which is the attribute values
 * joined with `, `.
 *
 * A collapsed name is indistinguishable from a correct one, so nothing downstream can detect it —
 * and merchants update the plugin on their own schedule, which can be weeks after the app. Composing
 * here removes the dependency on the server's `name` altogether, so the row is correct on 1.10.0 and
 * 1.10.1 alike, and looks IDENTICAL before and after a merchant updates.
 *
 * # Why the composition is faithful
 *
 * `attributes[].option` is already the human-readable value, not a slug: WooCommerce's
 * `get_attributes()` resolves taxonomy attributes through `get_term_by('slug', …)->name` before
 * serializing, on the products and variations controllers alike. So joining the options reproduces
 * `wc_get_formatted_variation( $variation, true, false, false )` — flat, values only, no parent, no
 * attribute labels — which is exactly what 1.10.1 sends.
 *
 * "Any <attribute>" is modelled as absence: WooCommerce skips empty values when formatting, and the
 * ingest projection drops those entries, so both sides agree without special-casing.
 *
 * Falls back to `payload.name` when a variation carries no usable attributes at all, so a malformed
 * or attribute-less record still renders something rather than an empty cell.
 */
export function resolveVariationName(payload: { name?: unknown; attributes?: unknown }): string {
	const attributes = (sanitizeVariationAttributesRead(payload?.attributes) ?? []) as {
		option?: string;
	}[];

	const composed = attributes
		.map((attribute) => (typeof attribute.option === 'string' ? attribute.option.trim() : ''))
		.filter((option) => option !== '')
		.join(', ');

	if (composed !== '') return composed;

	return typeof payload?.name === 'string' ? payload.name : '';
}
