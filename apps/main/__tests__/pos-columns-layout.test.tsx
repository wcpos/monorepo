import * as React from 'react';

import { act, create, type ReactTestRenderer } from 'react-test-renderer';

// Reset at module scope to avoid jest-expo's winter-runtime "require outside test scope" error.
jest.resetModules();

type PanelRecord = { id: string; testID?: string; defaultSize?: number };

const mockPanels: PanelRecord[] = [];
const mockChildOrder: string[] = [];
let mockLayoutHandler:
	| ((layout: number[], meta: { isUserInteraction: boolean }) => void)
	| undefined;
let mockPosition: 'left' | 'right' = 'left';
const mockPatchUI = jest.fn();

jest.mock('expo-router', () => ({ useSegments: () => [] }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('@wcpos/core/contexts/theme', () => ({ useTheme: () => ({ screenSize: 'lg' }) }));
jest.mock('@wcpos/core/screens/main/contexts/ui-settings', () => ({
	useUISettings: () => ({
		uiSettings: { width: 60, position: mockPosition },
		patchUI: mockPatchUI,
	}),
}));
/**
 * The slot registry and the POS registrations are the code under test, so they are the two
 * @wcpos/core modules that stay REAL — pinned to this checkout's source, because a linked
 * worktree borrows `node_modules` (and therefore the @wcpos/core symlink) from the main
 * tree. `virtual` covers the case where that symlink has no such subpath yet.
 *
 * Everything the registrations then reach — the two panel bodies and the filter-bar entry —
 * is stubbed under BOTH specifiers: they are one file wherever the symlink points here, and
 * two while it does not.
 */
jest.mock(
	'@wcpos/core/extensions/slots',
	() => jest.requireActual('../../../packages/core/src/extensions/slots'),
	{ virtual: true }
);
jest.mock(
	'@wcpos/core/screens/main/pos/register-slot-entries',
	() => jest.requireActual('../../../packages/core/src/screens/main/pos/register-slot-entries'),
	{ virtual: true }
);
jest.mock('@wcpos/core/screens/main/pos/products', () => ({ POSProducts: () => null }));
jest.mock('../../../packages/core/src/screens/main/pos/products', () => ({
	POSProducts: () => null,
}));
jest.mock('@wcpos/core/screens/main/pos/cart', () => ({ OpenOrders: () => null }));
jest.mock('../../../packages/core/src/screens/main/pos/cart', () => ({ OpenOrders: () => null }));
jest.mock('../../../packages/core/src/screens/main/pos/products/quick-filters-bar', () => ({
	QuickFiltersBar: () => null,
}));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/text', () => ({ Text: () => null }));
jest.mock('@wcpos/components/panels', () => {
	const react = jest.requireActual('react');
	return {
		PanelGroup: ({
			children,
			onLayoutChanged,
		}: {
			children: React.ReactNode;
			onLayoutChanged: (layout: number[], meta: { isUserInteraction: boolean }) => void;
		}) => {
			mockLayoutHandler = onLayoutChanged;
			return react.createElement(react.Fragment, null, children);
		},
		Panel: ({ children, ...props }: PanelRecord & { children: React.ReactNode }) => {
			mockPanels.push({ id: props.id, testID: props.testID, defaultSize: props.defaultSize });
			mockChildOrder.push(props.id);
			return react.createElement(react.Fragment, null, children);
		},
		PanelResizeHandle: ({ testID }: { testID: string }) => {
			mockChildOrder.push(testID);
			return null;
		},
	};
});

import ResizablePOSColumns from '../app/(app)/(drawer)/(pos)/(columns)/index';

function renderColumns(position: 'left' | 'right') {
	mockPosition = position;
	mockPanels.length = 0;
	mockChildOrder.length = 0;
	mockLayoutHandler = undefined;
	mockPatchUI.mockClear();
	let view: ReactTestRenderer;
	act(() => {
		view = create(<ResizablePOSColumns />);
	});
	act(() => view!.unmount());
}

describe('POS columns layout as a pos.columns.panel slot', () => {
	it('renders the registered panels products-first by default, with a handle between them', () => {
		renderColumns('left');

		expect(mockChildOrder).toEqual(['products', 'pos-resize-handle', 'cart']);
		expect(mockPanels).toEqual([
			{ id: 'products', testID: 'pos-products-panel', defaultSize: 60 },
			{ id: 'cart', testID: 'pos-cart-panel', defaultSize: 40 },
		]);
	});

	it('reverses the panels when the products panel is set to the right', () => {
		renderColumns('right');

		expect(mockChildOrder).toEqual(['cart', 'pos-resize-handle', 'products']);
		// Both sides stay sized whichever order they render in (#1620).
		expect(mockPanels).toEqual([
			{ id: 'cart', testID: 'pos-cart-panel', defaultSize: 40 },
			{ id: 'products', testID: 'pos-products-panel', defaultSize: 60 },
		]);
	});

	it.each([
		['left', [70, 30], 70],
		['right', [30, 70], 70],
	] as const)(
		'writes the products panel width from position %s whichever index it sits at',
		(position, layout, expected) => {
			renderColumns(position);

			act(() => mockLayoutHandler?.(layout as unknown as number[], { isUserInteraction: true }));
			expect(mockPatchUI).toHaveBeenCalledWith({ width: expected });
		}
	);

	it('ignores layout changes that were not driven by the user', () => {
		renderColumns('left');

		act(() => mockLayoutHandler?.([70, 30], { isUserInteraction: false }));
		expect(mockPatchUI).not.toHaveBeenCalled();
	});
});
