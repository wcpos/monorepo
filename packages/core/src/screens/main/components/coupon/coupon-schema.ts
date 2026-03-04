import * as z from 'zod';

export const couponFormSchema = z.object({
	code: z.string().min(1),
	amount: z.string().optional().default(''),
	discount_type: z.enum(['percent', 'fixed_cart', 'fixed_product']).default('percent'),
	description: z.string().optional().default(''),
	date_expires_gmt: z.string().nullable().optional(),
	individual_use: z.boolean().optional().default(false),
	free_shipping: z.boolean().optional().default(false),
	usage_limit: z.union([z.number(), z.null()]).optional(),
	usage_limit_per_user: z.union([z.number(), z.null()]).optional(),
	minimum_amount: z.string().optional().default(''),
	maximum_amount: z.string().optional().default(''),
	email_restrictions: z.array(z.string()).optional().default([]),
	meta_data: z
		.array(
			z.object({
				id: z.number().optional(),
				key: z.string(),
				value: z.string().nullable(),
				display_key: z.string().optional(),
				display_value: z.string().optional(),
			})
		)
		.optional(),
});
