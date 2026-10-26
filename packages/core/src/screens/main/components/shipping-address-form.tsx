import * as z from 'zod';

/**
 *
 */
export const shippingAddressSchema = z.object({
	shipping: z
		.object({
			first_name: z.string().optional(),
			last_name: z.string().optional(),
			company: z.string().optional(),
			address_1: z.string().optional(),
			address_2: z.string().optional(),
			city: z.string().optional(),
			state: z.string().optional(),
			country: z.string().optional(),
			postcode: z.string().optional(),
			phone: z.string().optional(),
		})
		.optional(),
});
