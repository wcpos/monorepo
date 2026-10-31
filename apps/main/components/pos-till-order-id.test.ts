import { tillOrderIdForRoute } from './pos-till-order-id';

// Match the neighboring pure tests' jest-expo runtime cleanup.
jest.resetModules();

const pos = ['(app)', '(drawer)', '(pos)'];
const till = [...pos, '(columns)', 'cart', '[...orderId]'];
const checkout = [...pos, '(modals)', 'cart', '[orderId]', 'checkout'];

describe('tillOrderIdForRoute', () => {
	it.each([
		{
			name: '1: the till delivers A',
			segments: till,
			orderIdFromParams: 'A',
			tillOrderId: undefined,
			lastOrderId: undefined,
			expected: { orderId: 'A', tillOrderId: 'A' },
		},
		{
			name: '2: checkout B keeps till A',
			segments: checkout,
			orderIdFromParams: 'B',
			tillOrderId: 'A',
			lastOrderId: 'B',
			expected: { orderId: 'A', tillOrderId: 'A' },
		},
		{
			name: '3: receipt B keeps till A',
			segments: [...pos, '(modals)', 'cart', 'receipt', '[orderId]'],
			orderIdFromParams: 'B',
			tillOrderId: 'A',
			lastOrderId: 'B',
			expected: { orderId: 'A', tillOrderId: 'A' },
		},
		{
			name: '4: returning to the till keeps A',
			segments: till,
			orderIdFromParams: 'A',
			tillOrderId: 'A',
			lastOrderId: 'A',
			expected: { orderId: 'A', tillOrderId: 'A' },
		},
		{
			name: '5: Products setParams delivers B',
			segments: [...pos, '(tabs)'],
			orderIdFromParams: 'B',
			tillOrderId: 'A',
			lastOrderId: 'A',
			expected: { orderId: 'B', tillOrderId: 'B' },
		},
		{
			name: '6: columns index clears the till',
			segments: [...pos, '(columns)'],
			orderIdFromParams: undefined,
			tillOrderId: 'A',
			lastOrderId: 'A',
			expected: { orderId: undefined, tillOrderId: undefined },
		},
		{
			name: '7: outside POS uses the remembered cart',
			segments: ['(app)', '(drawer)', 'settings'],
			orderIdFromParams: undefined,
			tillOrderId: 'A',
			lastOrderId: 'A',
			expected: { orderId: 'A', tillOrderId: 'A' },
		},
		{
			name: '8: cold checkout does not become the till',
			segments: checkout,
			orderIdFromParams: 'B',
			tillOrderId: undefined,
			lastOrderId: 'B',
			expected: { orderId: undefined, tillOrderId: undefined },
		},
	])('$name', ({ expected, ...input }) => {
		expect(tillOrderIdForRoute(input)).toStrictEqual(expected);
	});
});
