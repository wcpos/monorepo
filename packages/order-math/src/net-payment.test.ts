import { getNetPaymentTotal } from './net-payment';

// --- spec-prescribed cases ---

test('subtracts abs refund totals', () => {
	expect(getNetPaymentTotal('100', [{ total: '-10' }, { total: '5' }])).toBe(85);
});
test('prefers amount over total when present (orders-view variant)', () => {
	expect(getNetPaymentTotal('100', [{ amount: '7', total: '-10' }])).toBe(93);
});
test('null amount falls back to total; garbage coerces to 0', () => {
	expect(getNetPaymentTotal('100', [{ amount: null, total: '-10' }])).toBe(90);
	expect(getNetPaymentTotal('100', [{ total: 'abc' }])).toBe(100);
	expect(getNetPaymentTotal(undefined, null)).toBe(0);
});

// --- legacy parity pins ---

// PIN: packages/core/src/screens/main/pos/cart/utils/get-net-payment-total.ts
// Legacy: toNumber = parseFloat(String(value || '0')); abs-sums r.total only.
// For total='50.75', refunds=[{total:'-12.5'},{total:'-3.25'}]:
//   legacy refundTotal = abs(-12.5) + abs(-3.25) = 15.75; net = 50.75 - 15.75 = 35
test('parity: pos/cart/utils/get-net-payment-total.ts - abs sums total field', () => {
	expect(getNetPaymentTotal('50.75', [{ total: '-12.5' }, { total: '-3.25' }])).toBe(35);
});

// PIN: packages/core/src/screens/main/pos/cart/totals.tsx (~line 76)
// Legacy: reduce using parseFloat(r.total || '0'), then parseFloat(orderTotal ?? '0') - refundTotal.
// For total='200', refunds=[{total:'-25'},{total:'-10'}]:
//   legacy refundTotal = 25 + 10 = 35; net = 200 - 35 = 165
test('parity: pos/cart/totals.tsx inline reduce - abs sums total field', () => {
	expect(getNetPaymentTotal('200', [{ total: '-25' }, { total: '-10' }])).toBe(165);
});

// PIN: packages/core/src/screens/main/orders/view/sections/totals.tsx (~line 15)
// Legacy: 'amount' in refund ? (refund.amount ?? refund.total) : refund.total; via lodash toNumber.
// For total='100', refunds=[{amount:'8', total:'-10'},{total:'-5'}]:
//   refund[0]: 'amount' in refund → true → value = '8' ?? '-10' = '8'; abs(toNumber('8')) = 8
//   refund[1]: 'amount' not in refund → value = '-5'; abs(toNumber('-5')) = 5
//   refundTotal = 13; net = 100 - 13 = 87
test('parity: orders/view/sections/totals.tsx - prefers amount when key present', () => {
	expect(getNetPaymentTotal('100', [{ amount: '8', total: '-10' }, { total: '-5' }])).toBe(87);
});

// PIN: packages/core/src/screens/main/orders/view/sections/payment.tsx (~line 15)
// Same totalRefunded function as totals.tsx.
// For total='150', refunds=[{amount:'20',total:'-20'}]:
//   'amount' in refund → true → value = '20'; abs(20) = 20; net = 150 - 20 = 130
test('parity: orders/view/sections/payment.tsx - same totalRefunded logic as totals', () => {
	expect(getNetPaymentTotal('150', [{ amount: '20', total: '-20' }])).toBe(130);
});
