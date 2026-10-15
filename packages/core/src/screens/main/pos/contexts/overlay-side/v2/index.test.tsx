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
	['left', 'left', 'right'],
	['right', 'right', 'left'],
])(
	"cart subjects dock on the products' side; products subjects dock opposite",
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
