/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { InCartCount } from './in-cart-count';

const mockSprings: unknown[] = [];
const mockTimings: number[] = [];
let mockOrder = 'order-a';

jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: { View: jest.requireActual('react-native').View },
	ReduceMotion: { System: 'system' },
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
	withTiming: (value: number, config: { duration: number }) => {
		mockTimings.push(config.duration);
		return value;
	},
}));
jest.mock('../../../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: { uuid: mockOrder } }),
}));
jest.mock('../../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));

const FADE = 170;
const ROLL = 220;
const SWELL = 90;

beforeEach(() => {
	mockSprings.length = 0;
	mockTimings.length = 0;
	mockOrder = 'order-a';
});

const badge = () => screen.getByLabelText('pos_products.in_cart_count');

it('shows what stands in for it while the cart holds none, and moves nothing on mount', () => {
	const { rerender } = render(
		<InCartCount product="p" count={0} empty={<i data-testid="plus" />} />
	);
	expect(screen.getByTestId('plus')).toBeTruthy();
	rerender(<InCartCount product="p" count={3} empty={<i data-testid="plus" />} />);
	expect(screen.queryByTestId('plus')).toBeNull();
	mockSprings.length = 0;
	// A badge that mounts already holding a count is a page load or a scrolled-in row.
	render(<InCartCount product="q" count={2} />);
	expect(mockSprings).toHaveLength(0);
});

it('lands the first add: the number arrives and the badge bounces', () => {
	const { rerender } = render(<InCartCount product="p" count={0} />);
	rerender(<InCartCount product="p" count={1} />);
	expect(badge().textContent).toBe('1');
	expect(mockSprings).toHaveLength(1);
	// Nothing else moves: no ring, no glow (owner, 2026-10-01).
	expect(mockTimings).toEqual([FADE, SWELL]);
});

it('hands the old number over to the new one on every further add', () => {
	const { rerender } = render(<InCartCount product="p" count={1} />);
	rerender(<InCartCount product="p" count={2} />);
	// Both are on stage for the handover; the label reads only the new count.
	expect(badge().textContent).toBe('12');
	expect(mockSprings).toHaveLength(1);
	rerender(<InCartCount product="p" count={3} />);
	expect(badge().textContent).toBe('23');
	expect(mockSprings).toHaveLength(2);
});

it('a count that goes down changes the number without the landing', () => {
	const { rerender } = render(<InCartCount product="p" count={3} />);
	rerender(<InCartCount product="p" count={2} />);
	expect(mockSprings).toHaveLength(0);
	expect(mockTimings).toEqual([FADE]);
});

it('keeps the roll as an option', () => {
	const { rerender } = render(<InCartCount product="p" count={1} motion="roll" />);
	rerender(<InCartCount product="p" count={2} motion="roll" />);
	expect(mockTimings).toEqual([ROLL, SWELL]);
	rerender(<InCartCount product="p" count={1} motion="roll" />);
	expect(mockTimings).toEqual([ROLL, SWELL, ROLL]);
});

it('a different product or a different order is not an add', () => {
	const { rerender } = render(<InCartCount product="p" count={1} />);
	// The list recycled this row for another product.
	rerender(<InCartCount product="q" count={4} />);
	// The cashier switched to another open order.
	mockOrder = 'order-b';
	rerender(<InCartCount product="q" count={6} />);
	expect(badge().textContent).toBe('6');
	expect(mockSprings).toHaveLength(0);
	expect(mockTimings).toHaveLength(0);
});
