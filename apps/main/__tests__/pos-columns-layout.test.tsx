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

/**
 * `useUISettings` hands back a stable RxState container; `useDocField` is what subscribes a
 * component to one of its fields. This stands in for that subscription so a settings change
 * can be pushed at a MOUNTED route, the way the in-place settings dialog does it.
 */
const mockUISettings = {
	width: 60,
	// A getter, because the real RxState container is stable and its FIELDS change under it.
	// An object literal rebuilt per call would freeze whatever `useDocField` captured.
	get position() {
		return mockPosition;
	},
};
const mockUISettingsListeners = new Set<() => void>();
const mockSubscribeUISettings = (listener: () => void) => {
	mockUISettingsListeners.add(listener);
	return () => {
		mockUISettingsListeners.delete(listener);
	};
};

jest.mock('expo-router', () => ({ useSegments: () => [] }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('@wcpos/core/contexts/theme', () => ({ useTheme: () => ({ screenSize: 'lg' }) }));
jest.mock('@wcpos/query', () => {
	const react = jest.requireActual('react');
	return {
		useDocField: (source: unknown, select: (value: unknown) => unknown) => {
			const read = () => select(source);
			return react.useSyncExternalStore(mockSubscribeUISettings, read, read);
		},
	};
});
jest.mock('@wcpos/core/screens/main/contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: mockUISettings, patchUI: mockPatchUI }),
}));
/**
 * The slot registry and the panel registrations are the code under test, so they are the two
 * @wcpos/core modules that stay REAL — pinned to this checkout's source, because a linked
 * worktree borrows `node_modules` (and therefore the @wcpos/core symlink) from the main
 * tree. `virtual` covers the case where that symlink has no such subpath yet.
 *
 * The two panel bodies the registrations then reach are stubbed under BOTH specifiers: they
 * are one file wherever the symlink points here, and two while it does not.
 */
jest.mock(
	'@wcpos/core/extensions/slots',
	() => jest.requireActual('../../../packages/core/src/extensions/slots'),
	{ virtual: true }
);
jest.mock(
	'@wcpos/core/screens/main/pos/register-panel-entries',
	() => jest.requireActual('../../../packages/core/src/screens/main/pos/register-panel-entries'),
	{ virtual: true }
);
jest.mock('@wcpos/core/screens/main/pos/products', () => ({ POSProducts: () => null }));
jest.mock('../../../packages/core/src/screens/main/pos/products', () => ({
	POSProducts: () => null,
}));
jest.mock('@wcpos/core/screens/main/pos/cart', () => ({ OpenOrders: () => null }));
jest.mock('../../../packages/core/src/screens/main/pos/cart', () => ({ OpenOrders: () => null }));
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

let view: ReactTestRenderer | undefined;

function resetRecords() {
	mockPanels.length = 0;
	mockChildOrder.length = 0;
}

function renderColumns(position: 'left' | 'right') {
	mockPosition = position;
	resetRecords();
	mockLayoutHandler = undefined;
	mockPatchUI.mockClear();
	act(() => {
		view = create(<ResizablePOSColumns />);
	});
}

/** Change a UI setting the way the in-place settings dialog does: no remount. */
function setPositionSetting(position: 'left' | 'right') {
	mockPosition = position;
	resetRecords();
	act(() => {
		mockUISettingsListeners.forEach((listener) => listener());
	});
}

afterEach(() => {
	if (view) act(() => view!.unmount());
	view = undefined;
});

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

	it('reorders a MOUNTED route when the position setting changes', () => {
		renderColumns('left');
		expect(mockChildOrder).toEqual(['products', 'pos-resize-handle', 'cart']);

		setPositionSetting('right');
		expect(mockChildOrder).toEqual(['cart', 'pos-resize-handle', 'products']);

		setPositionSetting('left');
		expect(mockChildOrder).toEqual(['products', 'pos-resize-handle', 'cart']);
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
