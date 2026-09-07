/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { POSColumns } from './pos-columns';

let mockPosition = 'left';
const mockPatchUI = jest.fn();
type PanelProps = { children?: React.ReactNode; testID?: string; defaultSize?: number };

jest.mock('../../contexts/ui-settings', () => ({
	useUISettings: () => ({
		uiSettings: { position: mockPosition, width: 60 },
		patchUI: mockPatchUI,
	}),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: <T,>(source: T, select: (value: T) => unknown) => select(source),
}));
// The real registration module populates the real slot registry with these panels.
jest.mock('../cart', () => ({ OpenOrders: () => <div /> }));
jest.mock('../products', () => ({ POSProducts: () => <div /> }));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@wcpos/components/panels', () => ({
	Panel: ({ children, testID, defaultSize }: PanelProps) => (
		<div data-testid={testID} data-default-size={defaultSize}>
			{children}
		</div>
	),
	PanelGroup: ({ children }: PanelProps) => <div>{children}</div>,
	PanelResizeHandle: ({ testID }: PanelProps) => <div data-testid={testID} />,
}));

describe('POSColumns', () => {
	it('reverses the registered panels when products move right, keeping complementary sizes', () => {
		mockPosition = 'left';
		const { rerender } = render(<POSColumns />);
		const panelOrder = () => screen.getAllByTestId(/^pos-.*-panel$/).map((el) => el.dataset.testid);
		expect(panelOrder()).toEqual(['pos-products-panel', 'pos-cart-panel']);

		mockPosition = 'right';
		rerender(<POSColumns />);
		expect(panelOrder()).toEqual(['pos-cart-panel', 'pos-products-panel']);
		expect(screen.getByTestId('pos-products-panel').dataset.defaultSize).toBe('60');
		expect(screen.getByTestId('pos-cart-panel').dataset.defaultSize).toBe('40');
		expect(
			screen
				.getByTestId('pos-cart-panel')
				.compareDocumentPosition(screen.getByTestId('pos-resize-handle'))
		).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
		expect(
			screen
				.getByTestId('pos-resize-handle')
				.compareDocumentPosition(screen.getByTestId('pos-products-panel'))
		).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
	});
});
