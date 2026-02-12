import { filterApiQueryParams as filterOrderParams } from '../src/hooks/orders';
import { filterApiQueryParams as filterCustomerParams } from '../src/hooks/customers';
import {
	filterApiQueryParams as filterVariationParams,
	preQueryParams,
	postQueryResult,
} from '../src/hooks/variations';

describe('Hook Filters', () => {
	describe('Orders - filterApiQueryParams', () => {
		it('should convert date_created orderby to date', () => {
			const result = filterOrderParams({ orderby: 'date_created' });
			expect(result.orderby).toBe('date');
			expect(result.dp).toBe(6);
		});

		it('should convert date_created_gmt orderby to date', () => {
			const result = filterOrderParams({ orderby: 'date_created_gmt' });
			expect(result.orderby).toBe('date');
		});

		it('should convert number orderby to id', () => {
			const result = filterOrderParams({ orderby: 'number' });
			expect(result.orderby).toBe('id');
		});

		it('should pass through other orderby values unchanged', () => {
			const result = filterOrderParams({ orderby: 'total' });
			expect(result.orderby).toBe('total');
		});

		it('should convert customer_id to customer', () => {
			const result = filterOrderParams({ customer_id: 42 });
			expect(result.customer).toBe(42);
			expect(result.customer_id).toBeUndefined();
		});

		it('should extract pos_cashier and pos_store from $and meta_data', () => {
			const result = filterOrderParams({
				$and: [
					{ meta_data: { $elemMatch: { key: '_pos_user', value: '1' } } },
					{ meta_data: { $elemMatch: { key: '_pos_store', value: '2' } } },
				],
			});
			expect(result.pos_cashier).toBe('1');
			expect(result.pos_store).toBe('2');
			expect(result.$and).toBeUndefined();
		});

		it('should extract pos_cashier from single meta_data', () => {
			const result = filterOrderParams({
				meta_data: { $elemMatch: { key: '_pos_user', value: '5' } },
			});
			expect(result.pos_cashier).toBe('5');
			expect(result.pos_store).toBeUndefined();
			expect(result.meta_data).toBeUndefined();
		});

		it('should extract pos_store from single meta_data', () => {
			const result = filterOrderParams({
				meta_data: { $elemMatch: { key: '_pos_store', value: '3' } },
			});
			expect(result.pos_store).toBe('3');
			expect(result.pos_cashier).toBeUndefined();
		});

		it('should convert date_created_gmt range to after/before', () => {
			const result = filterOrderParams({
				date_created_gmt: { $gte: '2024-01-01', $lte: '2024-01-31' },
			});
			expect(result.after).toBe('2024-01-01');
			expect(result.before).toBe('2024-01-31');
			expect(result.date_created_gmt).toBeUndefined();
		});

		it('should always include dp: 6', () => {
			const result = filterOrderParams({});
			expect(result.dp).toBe(6);
		});

		it('should handle $and without matching meta_data keys', () => {
			const result = filterOrderParams({
				$and: [{ meta_data: { $elemMatch: { key: 'other_key', value: '1' } } }],
			});
			expect(result.pos_cashier).toBeUndefined();
			expect(result.pos_store).toBeUndefined();
			expect(result.$and).toBeUndefined();
		});
	});

	describe('Customers - filterApiQueryParams', () => {
		it('should convert date_created orderby to registered_date', () => {
			const result = filterCustomerParams({ orderby: 'date_created' });
			expect(result.orderby).toBe('registered_date');
		});

		it('should convert date_created_gmt orderby to registered_date', () => {
			const result = filterCustomerParams({ orderby: 'date_created_gmt' });
			expect(result.orderby).toBe('registered_date');
		});

		it('should default role to all when not provided', () => {
			const result = filterCustomerParams({});
			expect(result.role).toBe('all');
		});

		it('should keep provided role', () => {
			const result = filterCustomerParams({ role: 'customer' });
			expect(result.role).toBe('customer');
		});

		it('should convert $in roles to roles array', () => {
			const result = filterCustomerParams({
				role: { $in: ['administrator', 'shop_manager'] },
			});
			expect(result.roles).toEqual(['administrator', 'shop_manager']);
			expect(result.role).toBeUndefined();
		});
	});

	describe('Variations - filterApiQueryParams', () => {
		it('should convert name orderby to title', () => {
			const result = filterVariationParams({ orderby: 'name' });
			expect(result.orderby).toBe('title');
		});

		it('should convert date_created orderby to date', () => {
			const result = filterVariationParams({ orderby: 'date_created' });
			expect(result.orderby).toBe('date');
		});

		it('should convert date_created_gmt orderby to date', () => {
			const result = filterVariationParams({ orderby: 'date_created_gmt' });
			expect(result.orderby).toBe('date');
		});

		it('should always add status: publish', () => {
			const result = filterVariationParams({});
			expect(result.status).toBe('publish');
		});

		it('should set attributes to undefined', () => {
			const result = filterVariationParams({ attributes: [{ name: 'Color' }] });
			expect(result.attributes).toBeUndefined();
		});

		it('should pass through other orderby values unchanged', () => {
			const result = filterVariationParams({ orderby: 'id' });
			expect(result.orderby).toBe('id');
		});
	});

	describe('Variations - preQueryParams', () => {
		it('should remove attributes from selector', () => {
			const params = {
				selector: { attributes: { $allMatch: [{ name: 'Color' }] }, name: 'test' },
			};
			const result = preQueryParams(params);
			expect(result.selector.attributes).toBeUndefined();
			expect(result.selector.name).toBe('test');
		});

		it('should return params unchanged when no attributes', () => {
			const params = { selector: { name: 'test' } };
			const result = preQueryParams(params);
			expect(result).toEqual(params);
		});

		it('should handle missing selector gracefully', () => {
			const params = {};
			const result = preQueryParams(params);
			expect(result).toEqual(params);
		});
	});

	describe('Variations - postQueryResult', () => {
		it('should order by menu_order and id when no $allMatch', () => {
			const docs = [
				{ id: 3, menu_order: 2 },
				{ id: 1, menu_order: 1 },
				{ id: 2, menu_order: 2 },
			];
			const result = postQueryResult(docs, {}, {});
			expect(result.map((d: any) => d.id)).toEqual([1, 2, 3]);
		});

		it('should filter by attributes when $allMatch is present', () => {
			const docs = [
				{
					id: 1,
					attributes: [
						{ name: 'Color', option: 'Red' },
						{ name: 'Size', option: 'Large' },
					],
				},
				{
					id: 2,
					attributes: [
						{ name: 'Color', option: 'Blue' },
						{ name: 'Size', option: 'Large' },
					],
				},
			];
			const originalParams = {
				selector: {
					attributes: {
						$allMatch: [{ name: 'Color', option: 'Red' }],
					},
				},
			};
			const result = postQueryResult(docs, {}, originalParams);
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe(1);
		});

		it('should return all docs when $allMatch is empty', () => {
			const docs = [
				{ id: 1, attributes: [{ name: 'Color', option: 'Red' }] },
				{ id: 2, attributes: [{ name: 'Color', option: 'Blue' }] },
			];
			const originalParams = {
				selector: {
					attributes: {
						$allMatch: [],
					},
				},
			};
			const result = postQueryResult(docs, {}, originalParams);
			// Empty allMatch means order by menu_order/id instead
			expect(result).toHaveLength(2);
		});

		it('should handle docs without menu_order', () => {
			const docs = [{ id: 3 }, { id: 1 }, { id: 2 }];
			const result = postQueryResult(docs, {}, {});
			expect(result.map((d: any) => d.id)).toEqual([1, 2, 3]);
		});
	});
});
