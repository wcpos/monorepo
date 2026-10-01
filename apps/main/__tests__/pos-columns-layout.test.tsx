import * as React from 'react';

import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import ResizablePOSColumns from '../app/(app)/(drawer)/(pos)/(columns)/index';
import POSProductsTab from '../app/(app)/(drawer)/(pos)/(tabs)/index';

// Reset at module scope to avoid jest-expo's winter-runtime "require outside test scope" error.
jest.resetModules();

type PanelRecord = { id: string; testID?: string; defaultSize?: number };

const mockPanels: PanelRecord[] = [];
const mockChildOrder: string[] = [];
let mockLayoutHandler:
	((layout: number[], meta: { isUserInteraction: boolean }) => void) | undefined;
let mockPosition: 'left' | 'right' = 'left';
const mockPatchUI = jest.fn();
let mockScreenSize = 'lg';
let mockSegments: string[] = [];
let mockSuspendedPane: 'products' | 'cart' | null = null;
const mockPendingPane = new Promise<void>(() => {});
const mockMarkInteractive = jest.fn();

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

// Native press handling is unrelated to Suspense; avoid its lazy React import after resetModules.
jest.mock('react-native/Libraries/Components/Pressable/Pressable', () => ({
	default: 'Pressable',
}));
jest.mock('expo-router', () => ({ useSegments: () => mockSegments }));
// The EAS Observe marker needs the native module; the route's layout is what is under test.
jest.mock('expo-observe', () => {
	const react = jest.requireActual('react');
	return {
		ObserveInteractiveMarker: () => {
			react.useEffect(() => {
				mockMarkInteractive();
			}, []);
			return null;
		},
	};
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('@wcpos/core/contexts/theme', () => ({
	useTheme: () => ({ screenSize: mockScreenSize }),
}));
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
/**
 * The wide layout now lives in `POSColumns` (wcpos/roadmap#165), reached through the same
 * borrowed-symlink situation as the slots above: keep it REAL and pinned to this checkout.
 * What it reaches for beyond the slot — the checkout mode, the tender column, the receipt
 * stage, the current order, reanimated's native init — is not under test here.
 */
jest.mock(
	'@wcpos/core/screens/main/pos/columns',
	() => jest.requireActual('../../../packages/core/src/screens/main/pos/columns'),
	{ virtual: true }
);
jest.mock('react-native-reanimated', () => {
	const react = jest.requireActual('react');
	return {
		__esModule: true,
		default: {
			View: ({ children }: { children: React.ReactNode }) =>
				react.createElement(react.Fragment, null, children),
		},
		FadeIn: { duration: () => ({}) },
		FadeOut: { duration: () => ({}) },
		// `lib/motion` builds its easing curves at import; the columns import it for CROSSFADE.
		Easing: { bezier: () => (t: number) => t },
		ReduceMotion: { System: 'system' },
	};
});
jest.mock('../../../packages/core/src/screens/main/pos/contexts/current-order', () => ({
	useCurrentOrder: () => ({
		currentOrderRecord: { uuid: 'draft', isNew: true },
		openOrders: [],
		setCurrentOrderID: () => {},
	}),
}));
jest.mock('../../../packages/core/src/screens/main/pos/checkout/checkout-mode', () => ({
	useOrderCheckoutStage: () => 'cart',
	useCheckoutMode: () => ({
		checkoutOrders: new Set(),
		receiptOrders: new Set(),
		selectedReceiptOrder: null,
	}),
}));
jest.mock('../../../packages/core/src/screens/main/pos/checkout/column/checkout-column', () => ({
	CheckoutColumn: () => null,
}));
jest.mock(
	'../../../packages/core/src/screens/main/pos/checkout/receipt-stage/receipt-stage',
	() => ({ ReceiptStage: () => null })
);
jest.mock('@wcpos/core/screens/main/pos/products', () => ({ POSProducts: () => null }));
// The columns route and the panel entry render the v2 products screen since the register switch.
jest.mock('@wcpos/core/screens/main/pos/products/v2', () => ({
	POSProducts: () => {
		if (mockSuspendedPane === 'products') throw mockPendingPane;
		return null;
	},
}));
jest.mock('../../../packages/core/src/screens/main/pos/products/v2', () => ({
	POSProducts: () => {
		if (mockSuspendedPane === 'products') throw mockPendingPane;
		return null;
	},
}));
jest.mock('../../../packages/core/src/screens/main/pos/products', () => ({
	POSProducts: () => null,
}));
jest.mock('@wcpos/core/screens/main/pos/cart', () => ({
	OpenOrders: () => {
		if (mockSuspendedPane === 'cart') throw mockPendingPane;
		return null;
	},
}));
jest.mock('../../../packages/core/src/screens/main/pos/cart', () => ({
	OpenOrders: () => {
		if (mockSuspendedPane === 'cart') throw mockPendingPane;
		return null;
	},
}));
jest.mock('@wcpos/core/screens/main/pos/cart/register-bar', () => {
	const react = jest.requireActual('react');
	const { View } = jest.requireActual('react-native');
	return {
		RegisterBar: () => react.createElement(View, { testID: 'register-bar-stub' }),
	};
});
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/suspense', () => {
	const react = jest.requireActual('react');
	const { View } = jest.requireActual('react-native');
	return {
		Suspense: ({ children }: { children: React.ReactNode }) =>
			react.createElement(
				react.Suspense,
				{
					fallback: react.createElement(View, { testID: 'pane-fallback' }),
				},
				children
			),
	};
});
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

beforeEach(() => {
	mockScreenSize = 'lg';
	mockSegments = [];
	mockSuspendedPane = null;
	mockMarkInteractive.mockClear();
});

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

describe('phone Products pane (#2363)', () => {
	// Count only host nodes so React Native's composite View and its host are not counted twice.
	it('keeps the register bar in the small columns Products pane after landing on /cart', () => {
		mockScreenSize = 'sm';
		mockSegments = ['cart'];
		renderColumns('left');

		const panes = view!.root
			.findAllByProps({ testID: 'pos-products-tab' })
			.filter((node) => typeof node.type === 'string');
		expect(panes).toHaveLength(1);
		expect(
			panes[0]
				.findAllByProps({ testID: 'register-bar-stub' })
				.filter((node) => typeof node.type === 'string')
		).toHaveLength(1);
	});

	it('keeps the register bar in the small columns Products pane at the root route', () => {
		mockScreenSize = 'sm';
		mockSegments = [];
		renderColumns('left');

		const panes = view!.root
			.findAllByProps({ testID: 'pos-products-tab' })
			.filter((node) => typeof node.type === 'string');
		expect(panes).toHaveLength(1);
		expect(
			panes[0]
				.findAllByProps({ testID: 'register-bar-stub' })
				.filter((node) => typeof node.type === 'string')
		).toHaveLength(1);
	});

	it('does not render the phone Products pane or its register bar in wide columns', () => {
		mockScreenSize = 'lg';
		renderColumns('left');

		expect(view!.root.findAllByProps({ testID: 'pos-products-tab' })).toHaveLength(0);
		expect(view!.root.findAllByProps({ testID: 'register-bar-stub' })).toHaveLength(0);
	});

	it('keeps the register bar in the tabs Products pane', () => {
		act(() => {
			view = create(<POSProductsTab />);
		});

		const panes = view!.root
			.findAllByProps({ testID: 'pos-products-tab' })
			.filter((node) => typeof node.type === 'string');
		expect(panes).toHaveLength(1);
		expect(
			panes[0]
				.findAllByProps({ testID: 'register-bar-stub' })
				.filter((node) => typeof node.type === 'string')
		).toHaveLength(1);
	});
});

// A marker outside the active pane's Suspense boundary marks a fallback as interactive.
describe('small POS columns interactive timing', () => {
	it.each(['products', 'cart'] as const)(
		'waits for the active %s pane even when the inactive pane is ready',
		async (pane) => {
			mockScreenSize = 'sm';
			mockSegments = pane === 'cart' ? ['cart'] : [];
			mockSuspendedPane = pane;
			await act(async () => {
				view = create(<ResizablePOSColumns />);
			});

			expect(view!.root.findAllByProps({ testID: 'pane-fallback' }).length).toBeGreaterThan(0);
			expect(mockMarkInteractive).not.toHaveBeenCalled();

			mockSuspendedPane = null;
			await act(async () => {
				view!.update(<ResizablePOSColumns />);
			});
			expect(view!.root.findAllByProps({ testID: 'pane-fallback' })).toHaveLength(0);
			expect(mockMarkInteractive).toHaveBeenCalledTimes(1);
		}
	);
});
