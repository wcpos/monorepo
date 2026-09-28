/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import { usePanelSide } from './index';

let mockPosition = 'left';
jest.mock('../../../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: { position: mockPosition } }),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (value: unknown, select: (value: unknown) => unknown) => select(value),
}));

it.each([
	['left', 'right', 'left'],
	['right', 'left', 'right'],
])('places subjects with products on the %s', (position, cart, products) => {
	mockPosition = position;
	const { result } = renderHook(() => [
		usePanelSide('cart'),
		usePanelSide('products'),
		usePanelSide('shell'),
	]);
	expect(result.current).toEqual([cart, products, 'right']);
	expect(result.current).not.toContain('bottom');
});
