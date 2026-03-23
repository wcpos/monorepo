import * as z from 'zod';

/**
 * WooCommerce meta_data entries come in two shapes:
 * 1. Standard: { key, value } — used for internal POS data, custom fields, etc.
 * 2. Variation attribute: { attr_id, display_key, display_value } — used for variation attributes
 *    added to cart line items (no key/value present).
 *
 * Both shapes may include id, display_key, and display_value. Using passthrough()
 * to preserve any additional properties that WooCommerce may include.
 */
export const metaDataSchema = z.array(
	z
		.object({
			id: z.number().optional(),
			key: z.string().optional(),
			value: z.string().nullable().optional(),
			attr_id: z.number().optional(),
			display_key: z.string().optional(),
			display_value: z.string().optional(),
		})
		.passthrough()
);
