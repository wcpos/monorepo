import { normalizeSelectedCustomerID, resolveCustomerPillEntity } from './customer-filter-utils';

describe('customer filter utils', () => {
	describe('normalizeSelectedCustomerID', () => {
		it('normalizes numeric strings and preserves guest id 0', () => {
			expect(normalizeSelectedCustomerID('123')).toBe(123);
			expect(normalizeSelectedCustomerID('0')).toBe(0);
			expect(normalizeSelectedCustomerID(0)).toBe(0);
		});

		it('returns undefined for empty or invalid values', () => {
			expect(normalizeSelectedCustomerID('')).toBeUndefined();
			expect(normalizeSelectedCustomerID(undefined)).toBeUndefined();
			expect(normalizeSelectedCustomerID(null)).toBeUndefined();
			expect(normalizeSelectedCustomerID('abc')).toBeUndefined();
		});
	});

	describe('resolveCustomerPillEntity', () => {
		it('prefers a loaded customer with a real name', () => {
			const customer = { id: 3, first_name: 'Ada', last_name: 'Lovelace' } as any;

			expect(
				resolveCustomerPillEntity({
					customer,
					selectedCustomer: { id: 3, first_name: 'Different' } as any,
					customerID: 3,
					isActive: true,
				})
			).toBe(customer);
		});

		it('falls back to the selected customer when the loaded customer only has an id', () => {
			const selectedCustomer = { id: 3, first_name: 'Ada', last_name: 'Lovelace' } as any;

			expect(
				resolveCustomerPillEntity({
					customer: { id: 3 } as any,
					selectedCustomer,
					customerID: 3,
					isActive: true,
				})
			).toBe(selectedCustomer);
		});

		it('preserves the guest customer document', () => {
			const guestCustomer = { id: 0, billing: { first_name: 'Guest' } } as any;

			expect(
				resolveCustomerPillEntity({
					customer: guestCustomer,
					selectedCustomer: null,
					customerID: 0,
					isActive: true,
				})
			).toBe(guestCustomer);
		});
	});
});
