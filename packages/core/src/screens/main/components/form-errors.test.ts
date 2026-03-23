/**
 * @jest-environment node
 *
 * Tests for the FormErrors component's error handling pipeline.
 *
 * These tests verify two things:
 * 1. The zodResolver produces the correct error structure when validation fails
 *    (proving errors exist for FormErrors to display).
 * 2. The flattenErrors logic correctly extracts displayable messages from the
 *    nested error structure that React Hook Form / zodResolver produces.
 *
 * The actual rendering subscription fix (useFormState vs useFormContext) is
 * verified by the import assertion test — useFormState sets up an independent
 * subscription so FormErrors re-renders when errors change, even if the parent
 * component doesn't read formState.errors.
 */
import * as fs from 'fs';
import * as path from 'path';

import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

import { flattenErrors } from './flatten-errors';
import { metaDataSchema } from './meta-data-schema';

const formSchema = z.object({
	name: z.string().optional(),
	tax_status: z.enum(['taxable', 'none']),
	meta_data: metaDataSchema,
});

describe('FormErrors error pipeline', () => {
	/**
	 * The zodResolver returns { errors, values } — we can call it directly
	 * to see what error structure React Hook Form would receive.
	 */
	// Cast needed for direct resolver invocation in tests
	const resolver = zodResolver(formSchema as never) as never as (
		values: unknown,
		context: unknown,
		options: { shouldUseNativeValidation: boolean; fields: Record<string, unknown> }
	) => Promise<{ errors: Record<string, unknown>; values: unknown }>;

	describe('FormErrors uses useFormState (not useFormContext)', () => {
		it('should import useFormState for independent subscription', () => {
			const source = fs.readFileSync(path.resolve(__dirname, 'form-errors.tsx'), 'utf-8');
			// useFormState sets up its own subscription to form state changes,
			// so FormErrors re-renders when errors change even if the parent
			// component (which called useForm) doesn't read formState.errors.
			expect(source).toMatch(/import\s*\{[^}]*useFormState[^}]*\}\s*from\s*'react-hook-form'/);
			// Must NOT import useFormContext — it doesn't subscribe independently
			expect(source).not.toMatch(
				/import\s*\{[^}]*useFormContext[^}]*\}\s*from\s*'react-hook-form'/
			);
		});
	});

	describe('zodResolver produces errors for the old schema bug', () => {
		it('should produce NO errors for variation meta_data with the fixed schema', async () => {
			const { errors } = await resolver(
				{
					name: 'Masker Modis 4ply Wa',
					tax_status: 'taxable',
					meta_data: [
						{ key: '_woocommerce_pos_data', value: '{"price":"10"}' },
						{ attr_id: 1, display_key: 'Color', display_value: 'Green' },
						{ attr_id: 2, display_key: 'Size', display_value: 'Medium' },
						{ key: '_woocommerce_pos_uuid', value: 'uuid-001' },
					],
				},
				undefined,
				{ shouldUseNativeValidation: false, fields: {} }
			);

			expect(errors).toEqual({});
		});

		it('should produce NO errors for simple product meta_data', async () => {
			const { errors } = await resolver(
				{
					name: 'Simple Product',
					tax_status: 'none',
					meta_data: [
						{ key: '_woocommerce_pos_data', value: '{"price":"5"}' },
						{ key: '_woocommerce_pos_uuid', value: 'uuid-002' },
					],
				},
				undefined,
				{ shouldUseNativeValidation: false, fields: {} }
			);

			expect(errors).toEqual({});
		});
	});

	describe('zodResolver error structure when validation actually fails', () => {
		it('should produce errors for genuinely invalid data', async () => {
			const { errors } = await resolver(
				{
					name: 'Test',
					tax_status: 'invalid_status' as never, // not in enum
					meta_data: [],
				},
				undefined,
				{ shouldUseNativeValidation: false, fields: {} }
			);

			// Should have a tax_status error
			expect(errors).toHaveProperty('tax_status');
			expect((errors as any).tax_status.message).toBeTruthy();
		});

		it('should produce flattenable errors for invalid meta_data types', async () => {
			const { errors } = await resolver(
				{
					name: 'Test',
					tax_status: 'taxable',
					meta_data: [{ key: 123 as never }], // key must be string, not number
				},
				undefined,
				{ shouldUseNativeValidation: false, fields: {} }
			);

			// Should have meta_data errors
			expect(errors).toHaveProperty('meta_data');
		});
	});

	describe('flattenErrors correctly processes error structures', () => {
		it('should flatten simple field errors', () => {
			const errors = {
				name: { message: 'Name is required', type: 'required' },
			};
			const result = flattenErrors(errors);
			expect(result).toEqual([{ path: 'name', message: 'Name is required' }]);
		});

		it('should flatten nested array field errors', () => {
			// Simulates the error structure from zodResolver for array items
			const errors = {
				meta_data: {
					1: {
						key: { message: 'Expected string, received undefined', type: 'invalid_type' },
						value: { message: 'Expected string, received undefined', type: 'invalid_type' },
					},
				},
			};
			const result = flattenErrors(errors);
			expect(result).toHaveLength(2);
			expect(result).toContainEqual({
				path: 'meta_data.1.key',
				message: 'Expected string, received undefined',
			});
			expect(result).toContainEqual({
				path: 'meta_data.1.value',
				message: 'Expected string, received undefined',
			});
		});

		it('should flatten multiple array item errors', () => {
			const errors = {
				meta_data: {
					1: { key: { message: 'Required', type: 'invalid_type' } },
					2: { key: { message: 'Required', type: 'invalid_type' } },
				},
			};
			const result = flattenErrors(errors);
			expect(result).toHaveLength(2);
			expect(result[0].path).toBe('meta_data.1.key');
			expect(result[1].path).toBe('meta_data.2.key');
		});

		it('should return empty array when no errors', () => {
			const result = flattenErrors({});
			expect(result).toEqual([]);
		});

		it('should skip undefined entries in sparse arrays', () => {
			// Sparse array: index 0 is undefined, index 1 has errors
			const errors = {
				meta_data: [
					undefined,
					{ key: { message: 'Required', type: 'invalid_type' } },
				] as unknown as Record<string, unknown>,
			};
			const result = flattenErrors(errors);
			expect(result).toHaveLength(1);
			expect(result[0].path).toBe('meta_data.1.key');
		});
	});
});
