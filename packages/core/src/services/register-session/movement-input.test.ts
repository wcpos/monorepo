import { movementFieldError, normalizeAmount } from './movement-input';

describe('normalizeAmount', () => {
	it.each([
		['10,50', '10.50'],
		['10', '10'],
		['10.', '10'],
		['.5', '0.5'],
		[' 10 ', '10'],
	])('rewrites %s as %s', (typed, normalized) => {
		expect(normalizeAmount(typed)).toBe(normalized);
	});

	it.each([
		['1,000.50', '1,000.50'],
		['1.000,50', '1.000,50'],
		['1,2,3', '1,2,3'],
		['1 000', '1 000'],
	])('leaves %s alone rather than guess what the cashier meant', (typed, unchanged) => {
		expect(normalizeAmount(typed)).toBe(unchanged);
	});
});

describe('movementFieldError', () => {
	const paidIn = { type: 'paid_in' as const, amount: '20', reason: 'Change' };

	it('accepts a movement the server would accept', () => {
		expect(movementFieldError(paidIn)).toBeNull();
		expect(movementFieldError({ ...paidIn, amount: '10,50' })).toBeNull();
	});

	it.each(['', '   '])('names the reason when it is %p', (reason) => {
		expect(movementFieldError({ ...paidIn, reason })).toBe('reason');
	});

	it('requires a reason for a no sale, which the server refuses without one', () => {
		expect(movementFieldError({ type: 'no_sale', amount: '0', reason: '' })).toBe('reason');
		expect(movementFieldError({ type: 'no_sale', amount: '0', reason: 'Wrong change' })).toBeNull();
	});

	it('names the reason when it is longer than the server will store', () => {
		expect(movementFieldError({ ...paidIn, reason: 'x'.repeat(501) })).toBe('reason');
		expect(movementFieldError({ ...paidIn, reason: 'x'.repeat(500) })).toBeNull();
	});

	it.each([
		['1e2', 'exponent notation is not a decimal string'],
		['10.50.1', 'two decimal points'],
		['-5', 'the column is unsigned'],
		['0', 'a paid in of nothing'],
		['0.00', 'a paid in of nothing, written out'],
		['', 'nothing typed'],
		['1,000.50', 'an ambiguous separator pair'],
		['1234567890123456', 'more than fifteen integer digits'],
	])('names the amount for %p — %s', (amount) => {
		expect(movementFieldError({ ...paidIn, amount })).toBe('amount');
	});

	it('ignores leading zeros when counting the integer digits, as the server does', () => {
		expect(movementFieldError({ ...paidIn, amount: `0000${'9'.repeat(15)}` })).toBeNull();
	});
});
