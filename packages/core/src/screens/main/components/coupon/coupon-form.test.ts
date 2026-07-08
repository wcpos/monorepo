/**
 * @jest-environment node
 *
 * Tests for the coupon form Zod schema validation.
 */
import { couponFormSchema } from './coupon-schema';

describe('couponFormSchema', () => {
	it('should accept a valid coupon with just a code', () => {
		const result = couponFormSchema.safeParse({ code: 'SUMMER20' });
		expect(result.success).toBe(true);
	});

	it('should reject a coupon without a code', () => {
		const result = couponFormSchema.safeParse({});
		expect(result.success).toBe(false);
	});

	it('should reject an empty code', () => {
		const result = couponFormSchema.safeParse({ code: '' });
		expect(result.success).toBe(false);
	});

	it('should accept all discount types', () => {
		for (const type of ['percent', 'fixed_cart', 'fixed_product']) {
			const result = couponFormSchema.safeParse({ code: 'TEST', discount_type: type });
			expect(result.success).toBe(true);
		}
	});

	it('should reject an invalid discount type', () => {
		const result = couponFormSchema.safeParse({ code: 'TEST', discount_type: 'bogus' });
		expect(result.success).toBe(false);
	});

	it('should default discount_type to percent', () => {
		const result = couponFormSchema.parse({ code: 'TEST' });
		expect(result.discount_type).toBe('percent');
	});

	it('should default boolean fields to false', () => {
		const result = couponFormSchema.parse({ code: 'TEST' });
		expect(result.individual_use).toBe(false);
		expect(result.free_shipping).toBe(false);
	});

	it('should accept nullable date_expires_gmt', () => {
		const result = couponFormSchema.safeParse({
			code: 'EXPIRE',
			date_expires_gmt: null,
		});
		expect(result.success).toBe(true);
	});

	it('should accept a full coupon object', () => {
		const result = couponFormSchema.safeParse({
			code: 'FULL',
			amount: '15.00',
			discount_type: 'fixed_cart',
			description: 'A test coupon',
			date_expires_gmt: '2026-12-31T23:59:59',
			individual_use: true,
			free_shipping: true,
			usage_limit: 100,
			usage_limit_per_user: 1,
			limit_usage_to_x_items: 2,
			minimum_amount: '50.00',
			maximum_amount: '500.00',
			email_restrictions: ['test@example.com'],
		});
		expect(result.success).toBe(true);
	});

	it('should accept null usage_limit', () => {
		const result = couponFormSchema.safeParse({
			code: 'TEST',
			usage_limit: null,
		});
		expect(result.success).toBe(true);
	});

	it('should accept 0 as the clearing value for every usage limit field', () => {
		const result = couponFormSchema.safeParse({
			code: 'TEST',
			usage_limit: 0,
			usage_limit_per_user: 0,
			limit_usage_to_x_items: 0,
		});
		expect(result.success).toBe(true);
	});

	it('should accept usage_limit_per_user and limit_usage_to_x_items as number or null', () => {
		expect(
			couponFormSchema.safeParse({
				code: 'TEST',
				usage_limit_per_user: 3,
				limit_usage_to_x_items: 5,
			}).success
		).toBe(true);
		expect(
			couponFormSchema.safeParse({
				code: 'TEST',
				usage_limit_per_user: null,
				limit_usage_to_x_items: null,
			}).success
		).toBe(true);
	});
});
