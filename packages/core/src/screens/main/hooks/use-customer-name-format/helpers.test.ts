/**
 * @jest-environment node
 */
import { extractNameFromJSON } from './helpers';

import type { JSON as CustomerJSON } from './helpers';

describe('use-customer-name-format helpers', () => {
	describe('extractNameFromJSON', () => {
		describe('primary name extraction (first_name + last_name)', () => {
			it('should return full name when both first and last name are present', () => {
				const json: CustomerJSON = {
					first_name: 'John',
					last_name: 'Doe',
				};
				expect(extractNameFromJSON(json)).toBe('John Doe');
			});

			it('should return first name only when last name is missing', () => {
				const json: CustomerJSON = {
					first_name: 'John',
				};
				expect(extractNameFromJSON(json)).toBe('John');
			});

			it('should return last name only when first name is missing', () => {
				const json: CustomerJSON = {
					last_name: 'Doe',
				};
				expect(extractNameFromJSON(json)).toBe('Doe');
			});

			it('should trim whitespace from names', () => {
				const json: CustomerJSON = {
					first_name: '  John  ',
					last_name: '  Doe  ',
				};
				expect(extractNameFromJSON(json)).toBe('John Doe');
			});
		});

		describe('billing fallback', () => {
			it('should fall back to billing name when primary name is empty', () => {
				const json: CustomerJSON = {
					billing: {
						first_name: 'Jane',
						last_name: 'Smith',
					},
				};
				expect(extractNameFromJSON(json)).toBe('Jane Smith');
			});

			it('should fall back to billing first name only', () => {
				const json: CustomerJSON = {
					billing: {
						first_name: 'Jane',
					},
				};
				expect(extractNameFromJSON(json)).toBe('Jane');
			});

			it('should fall back to billing last name only', () => {
				const json: CustomerJSON = {
					billing: {
						last_name: 'Smith',
					},
				};
				expect(extractNameFromJSON(json)).toBe('Smith');
			});

			it('should prefer primary name over billing', () => {
				const json: CustomerJSON = {
					first_name: 'John',
					last_name: 'Doe',
					billing: {
						first_name: 'Jane',
						last_name: 'Smith',
					},
				};
				expect(extractNameFromJSON(json)).toBe('John Doe');
			});
		});

		describe('shipping fallback', () => {
			it('should fall back to shipping name when billing is also empty', () => {
				const json: CustomerJSON = {
					shipping: {
						first_name: 'Bob',
						last_name: 'Wilson',
					},
				};
				expect(extractNameFromJSON(json)).toBe('Bob Wilson');
			});

			it('should prefer billing over shipping', () => {
				const json: CustomerJSON = {
					billing: {
						first_name: 'Jane',
						last_name: 'Smith',
					},
					shipping: {
						first_name: 'Bob',
						last_name: 'Wilson',
					},
				};
				expect(extractNameFromJSON(json)).toBe('Jane Smith');
			});
		});

		describe('username fallback', () => {
			it('should fall back to username when names are empty', () => {
				const json: CustomerJSON = {
					username: 'johndoe',
				};
				expect(extractNameFromJSON(json)).toBe('johndoe');
			});

			it('should fall back to billing username when primary username is empty', () => {
				const json: CustomerJSON = {
					billing: {
						username: 'billinguser',
					},
				};
				expect(extractNameFromJSON(json)).toBe('billinguser');
			});

			it('should prefer primary username over billing username', () => {
				const json: CustomerJSON = {
					username: 'primaryuser',
					billing: {
						username: 'billinguser',
					},
				};
				expect(extractNameFromJSON(json)).toBe('primaryuser');
			});
		});

		describe('email fallback', () => {
			it('should fall back to email when all other fields are empty', () => {
				const json: CustomerJSON = {
					email: 'john@example.com',
				};
				expect(extractNameFromJSON(json)).toBe('john@example.com');
			});

			it('should fall back to billing email when primary email is empty', () => {
				const json: CustomerJSON = {
					billing: {
						email: 'billing@example.com',
					},
				};
				expect(extractNameFromJSON(json)).toBe('billing@example.com');
			});

			it('should prefer primary email over billing email', () => {
				const json: CustomerJSON = {
					email: 'primary@example.com',
					billing: {
						email: 'billing@example.com',
					},
				};
				expect(extractNameFromJSON(json)).toBe('primary@example.com');
			});
		});

		describe('empty/missing values', () => {
			it('should return empty string when all fields are empty', () => {
				const json: CustomerJSON = {};
				expect(extractNameFromJSON(json)).toBe('');
			});

			it('should return empty string when all fields are whitespace', () => {
				const json: CustomerJSON = {
					first_name: '   ',
					last_name: '   ',
					username: '   ',
					email: '   ',
				};
				expect(extractNameFromJSON(json)).toBe('');
			});

			it('should handle undefined nested objects', () => {
				const json: CustomerJSON = {
					billing: undefined,
					shipping: undefined,
				};
				expect(extractNameFromJSON(json)).toBe('');
			});

			it('should skip empty strings and continue to next fallback', () => {
				const json: CustomerJSON = {
					first_name: '',
					last_name: '',
					billing: {
						first_name: '',
						last_name: '',
					},
					shipping: {
						first_name: 'Shipping',
						last_name: 'Name',
					},
				};
				expect(extractNameFromJSON(json)).toBe('Shipping Name');
			});
		});

		describe('real-world scenarios', () => {
			it('should handle a typical WooCommerce customer object', () => {
				const json: CustomerJSON = {
					id: 123,
					customer_id: 456,
					first_name: 'John',
					last_name: 'Doe',
					username: 'johndoe',
					email: 'john@example.com',
					billing: {
						first_name: 'John',
						last_name: 'Doe',
						email: 'john@example.com',
					},
					shipping: {
						first_name: 'John',
						last_name: 'Doe',
					},
				};
				expect(extractNameFromJSON(json)).toBe('John Doe');
			});

			it('should handle a guest customer (no names, only email)', () => {
				const json: CustomerJSON = {
					id: 0,
					billing: {
						email: 'guest@example.com',
					},
				};
				expect(extractNameFromJSON(json)).toBe('guest@example.com');
			});

			it('should handle an order object with customer data', () => {
				const json: CustomerJSON = {
					customer_id: 789,
					billing: {
						first_name: 'Jane',
						last_name: 'Smith',
						email: 'jane@example.com',
					},
				};
				expect(extractNameFromJSON(json)).toBe('Jane Smith');
			});
		});
	});
});
