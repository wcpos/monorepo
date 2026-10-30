/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import { usePanelSide } from './index';

let mockPosition = 'left';
jest.mock('../../../contexts/ui-settings', () => ({
	// The side is the cart doc's setting (#3117); the products doc no longer carries one.
	useUISettings: (id: string) => ({
		uiSettings: id === 'pos-cart' ? { position: mockPosition } : {},
	}),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (value: unknown, select: (value: unknown) => unknown) => select(value),
}));

it.each([
	// [cart side, cart subjects, products subjects]
	['right', 'left', 'right'],
	['left', 'right', 'left'],
])(
	"cart subjects dock on the products' side, opposite the cart; products subjects dock over the cart",
	(position, cart, products) => {
		mockPosition = position;
		const { result } = renderHook(() => [
			usePanelSide('cart'),
			usePanelSide('products'),
			usePanelSide('shell'),
		]);
		expect(result.current).toEqual([cart, products, 'right']);
		expect(result.current).not.toContain('bottom');
	}
);
