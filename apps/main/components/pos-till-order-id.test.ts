import { tillOrderIdForRoute } from './pos-till-order-id';

const pos = ['(app)', '(drawer)', '(pos)'];
const cart = [...pos, '(columns)', 'cart', '[...orderId]'];
const checkout = [...pos, '(modals)', 'cart', '[orderId]', 'checkout'];

it.each([
	{
		name: '1: the till route delivers A',
		segments: cart,
		orderIdFromParams: 'A',
		tillOrderId: undefined,
		expected: { orderId: 'A', tillOrderId: 'A' },
	},
	{
		name: '2: checkout sheet B keeps till A',
		segments: checkout,
		orderIdFromParams: 'B',
		tillOrderId: 'A',
		expected: { orderId: 'A', tillOrderId: 'A' },
	},
	{
		name: '3: receipt sheet B keeps till A',
		segments: [...pos, '(modals)', 'cart', 'receipt', '[orderId]'],
		orderIdFromParams: 'B',
		tillOrderId: 'A',
		expected: { orderId: 'A', tillOrderId: 'A' },
	},
	{
		name: '4: returning to the till keeps A',
		segments: cart,
		orderIdFromParams: 'A',
		tillOrderId: 'A',
		expected: { orderId: 'A', tillOrderId: 'A' },
	},
	{
		name: '5: Products setParams delivers B',
		segments: [...pos, '(tabs)'],
		orderIdFromParams: 'B',
		tillOrderId: 'A',
		expected: { orderId: 'B', tillOrderId: 'B' },
	},
	{
		name: '6: the columns index clears the till id',
		segments: [...pos, '(columns)'],
		orderIdFromParams: undefined,
		tillOrderId: 'A',
		expected: { orderId: undefined, tillOrderId: undefined },
	},
	{
		name: '7: outside POS uses lastOrderId and preserves the till',
		segments: ['(app)', '(drawer)', 'settings'],
		orderIdFromParams: undefined,
		tillOrderId: 'A',
		expected: { orderId: 'A', tillOrderId: 'A' },
	},
	{
		name: '8: cold checkout has no till id',
		segments: checkout,
		orderIdFromParams: 'B',
		tillOrderId: undefined,
		expected: { orderId: undefined, tillOrderId: undefined },
	},
])('$name', ({ segments, orderIdFromParams, tillOrderId, expected }) => {
	expect(
		tillOrderIdForRoute({ segments, orderIdFromParams, tillOrderId, lastOrderId: 'A' })
	).toEqual(expected);
});
