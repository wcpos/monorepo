/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import { oppositeOverlaySide, POSOverlaySideProvider, usePOSOverlaySide } from './index';

let mockPosition: string | undefined = 'left';
let mockScreenSize = 'md';
jest.mock('../../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: { position: mockPosition } }),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (value: unknown, select: (value: unknown) => unknown) => select(value),
}));
jest.mock('../../../../../contexts/theme/use-breakpoint', () => ({
	useBreakpoint: () => mockScreenSize,
}));

beforeEach(() => {
	mockPosition = 'left';
	mockScreenSize = 'md';
});

it.each(['left', 'right'])('uses the products %s side', (position) => {
	mockPosition = position;
	const { result } = renderHook(usePOSOverlaySide, { wrapper: POSOverlaySideProvider });
	expect(result.current).toBe(position);
});

it('updates the side while mounted, including phone sheets and invalid settings', () => {
	const { result, rerender } = renderHook(usePOSOverlaySide, {
		wrapper: POSOverlaySideProvider,
	});
	mockPosition = 'right';
	rerender();
	expect(result.current).toBe('right');
	mockScreenSize = 'sm';
	rerender();
	expect(result.current).toBe('bottom');
	mockScreenSize = 'lg';
	mockPosition = undefined;
	rerender();
	expect(result.current).toBe('left');
});

it('keeps non-POS panels on the right', () => {
	const { result } = renderHook(usePOSOverlaySide);
	expect(result.current).toBe('right');
});

it('opens settings opposite their panel', () =>
	expect(
		['left', 'right', 'bottom'].map((side) =>
			oppositeOverlaySide(side as 'left' | 'right' | 'bottom')
		)
	).toEqual(['right', 'left', 'bottom']));
