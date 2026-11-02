/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { CartTabCount } from './cart-tab-count';

type Order = {
	uuid: string;
	isNew?: boolean;
	payload: {
		line_items?: { quantity?: number; product_id?: number | null }[];
		fee_lines?: { total: string }[];
		shipping_lines?: { total: string }[];
	};
};

const mockSprings: unknown[] = [];
let mockOrder: Order;

jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: { View: jest.requireActual('react-native').View },
	ReduceMotion: { System: 'system' },
	Keyframe: jest.fn(() => ({ duration: jest.fn() })),
	Easing: { bezier: () => 'ease', linear: 'linear' },
	Extrapolation: { CLAMP: 'clamp' },
	interpolate: (value: number) => value,
	useAnimatedStyle: () => ({}),
	useSharedValue: (value: number) => jest.requireActual('react').useRef({ value }).current,
	withSequence: (...steps: number[]) => steps.at(-1),
	withSpring: (value: number, config: unknown) => {
		mockSprings.push(config);
		return value;
	},
	withTiming: (value: number) => value,
}));
jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: mockOrder }),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (doc: unknown, pick: (doc: unknown) => unknown) => pick(doc),
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span data-testid="text">{children}</span>,
}));

const blank = (uuid: string): Order => ({ uuid, isNew: true, payload: { line_items: [] } });
const order = (uuid: string, ...quantities: number[]): Order => ({
	uuid,
	payload: { line_items: quantities.map((quantity) => ({ quantity })) },
});
// The number on stage: during a handover the old one is drawn too, first.
const shown = () => screen.getAllByTestId('text').at(-1)?.textContent;

beforeEach(() => {
	mockSprings.length = 0;
});

it('reads the strip\'s "New" for a blank cart', () => {
	mockOrder = blank('a');
	render(<CartTabCount />);
	expect(shown()).toBe('pos_cart.new_cart_tab');
});

it('counts the quantities across the lines, not the lines', () => {
	mockOrder = order('a', 2, 3);
	render(<CartTabCount />);
	expect(shown()).toBe('5');
});

it('does not count a removed line left as a tombstone: the cart hides it too', () => {
	// A synced line is retired by nulling product_id and keeps its quantity (useRemoveLineItem).
	mockOrder = {
		uuid: 'a',
		payload: {
			line_items: [
				{ product_id: 12, quantity: 3 },
				{ product_id: null, quantity: 4 },
			],
		},
	};
	render(<CartTabCount />);
	expect(shown()).toBe('3');
});

it('reads "New" when every line is a tombstone', () => {
	mockOrder = { uuid: 'a', payload: { line_items: [{ product_id: null, quantity: 2 }] } };
	render(<CartTabCount />);
	expect(shown()).toBe('pos_cart.new_cart_tab');
});

it('does not count a fee or shipping line: they are not products', () => {
	mockOrder = {
		uuid: 'a',
		payload: { line_items: [], fee_lines: [{ total: '5' }], shipping_lines: [{ total: '2' }] },
	};
	render(<CartTabCount />);
	expect(shown()).toBe('pos_cart.new_cart_tab');
});

// The first add: the template is born under its own uuid, but the provider may show the next
// blank template for a render before it selects the born order. Still the same cart: it beats.
it('lands the first add in a blank cart, across the template swap', () => {
	mockOrder = blank('a');
	const { rerender } = render(<CartTabCount />);
	mockOrder = blank('b');
	rerender(<CartTabCount />);
	expect(mockSprings).toHaveLength(0);
	mockOrder = order('a', 1);
	rerender(<CartTabCount />);
	expect(shown()).toBe('1');
	expect(mockSprings).toHaveLength(1);
});

it('lands an add in a cart that already holds lines', () => {
	mockOrder = order('a', 1);
	const { rerender } = render(<CartTabCount />);
	mockOrder = order('a', 2);
	rerender(<CartTabCount />);
	expect(shown()).toBe('2');
	expect(mockSprings).toHaveLength(1);
});

// A different cart is a different thing counted, not a change in the count.
it('moves nothing when the cashier switches carts, a blank one included', () => {
	mockOrder = order('a', 2);
	const { rerender } = render(<CartTabCount />);
	mockOrder = order('c', 5);
	rerender(<CartTabCount />);
	expect(shown()).toBe('5');
	mockOrder = blank('d');
	rerender(<CartTabCount />);
	mockOrder = order('a', 3);
	rerender(<CartTabCount />);
	expect(shown()).toBe('3');
	expect(mockSprings).toHaveLength(0);
});
