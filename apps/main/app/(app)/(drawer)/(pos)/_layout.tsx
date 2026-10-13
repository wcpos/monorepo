import React from 'react';
import { Platform, View, type ViewInstance } from 'react-native';

import { Stack, useGlobalSearchParams, useSegments } from 'expo-router';
import { SystemBars } from 'react-native-edge-to-edge';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';

import { UpgradeNotice } from '@wcpos/core/screens/main/components/header/upgrade-notice';
import { UpgradeNoticeContext } from '@wcpos/core/screens/main/components/header/upgrade-notice-context';
import { useDocField } from '@wcpos/query';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { registerPortalContainer } from '@wcpos/components/lib/portal-container';
import { PortalHost } from '@wcpos/components/portal';
import { Suspense } from '@wcpos/components/suspense';
import { useStoreSession } from '@wcpos/core/contexts/app-state';
import { PersistedStateProvider } from '@wcpos/core/contexts/persisted-state';
import { CommandsProvider } from '@wcpos/core/extensions/commands';
import { Hotkeys } from '@wcpos/core/extensions/hotkeys';
import { PosUrlMirror } from '@wcpos/core/screens/main/pos/checkout/use-pos-url-mirror';
import { useCheckoutUrlSeed } from '@wcpos/core/screens/main/pos/checkout/use-checkout-url-seed';
import { useResetCheckoutModeOnStoreChange } from '@wcpos/core/screens/main/pos/checkout/checkout-mode';
import { useRejectedOrderSavesSync } from '@wcpos/core/screens/main/pos/checkout/use-rejected-order-saves';
import { TaxRatesProvider } from '@wcpos/core/screens/main/contexts/tax-rates';
import { useDefaultCustomer } from '@wcpos/core/screens/main/hooks/use-default-customer';
import {
	CurrentOrderProvider,
	useOpenOrdersHandle,
} from '@wcpos/core/screens/main/pos/contexts/current-order';
import { OrderEngineWarningsProvider } from '@wcpos/core/screens/main/pos/contexts/order-engine-warnings';
import { OrderMoneyDivergenceProvider } from '@wcpos/core/screens/main/pos/contexts/order-money-divergence';
import { POSOverlaySideProvider } from '@wcpos/core/screens/main/pos/contexts/overlay-side';
import { CustomerDisplaySnapshotSource } from '@wcpos/core/screens/main/pos/customer-display/snapshot-source';
import { useRegisterBinding } from '@wcpos/core/services/register/use-register-binding';

import { useNavigationBackground } from '../../../../components/use-navigation-background';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	anchor: 'index',
};

export default function POSLayout() {
	const { wpCredentials, store } = useStoreSession();
	const cashierID = useDocField(wpCredentials, (value) => value.id) as number | undefined;
	const storeID = useDocField(store, (value) => value.id) as number | undefined;
	useResetCheckoutModeOnStoreChange(storeID);
	useRejectedOrderSavesSync(storeID);
	const segments: string[] = useSegments();
	// Handle catch-all route param - [...orderId] returns an array (could be empty array for /cart)
	const params = useGlobalSearchParams<{ orderId: string | string[] }>();
	useCheckoutUrlSeed(params.orderId);

	// Extract orderId: handle array (catch-all) vs string, and handle empty array
	let orderIdFromParams: string | undefined;
	if (Array.isArray(params.orderId)) {
		// Catch-all route: empty array means /cart (new order), non-empty means /cart/uuid
		orderIdFromParams = params.orderId.length > 0 ? params.orderId[0] : undefined;
	} else {
		orderIdFromParams = params.orderId;
	}

	// Check if we're currently in the POS route structure
	const isInPOSRoute = segments.includes('(pos)');

	// Check if we're at a /cart route (with or without orderId)
	const isAtCartRoute = segments.includes('cart');

	// Remember the last valid orderId when at a cart route with an orderId.
	// This prevents losing the orderId when a modal (like settings) is opened, which
	// navigates away from the POS routes. We only remember when explicitly at a cart
	// route with an orderId so that /cart (new order) still shows a new order.
	//
	// This uses React's "adjusting state during render" pattern: when a new candidate
	// orderId is observed we store it immediately during render (no effect, no ref), so
	// the value survives the transition out of the POS routes when a modal opens.
	const [lastOrderId, setLastOrderId] = React.useState<string | undefined>(undefined);
	if (isInPOSRoute && isAtCartRoute && orderIdFromParams && orderIdFromParams !== lastOrderId) {
		setLastOrderId(orderIdFromParams);
	}

	// Use the route param if in POS, otherwise use the remembered value (for modals)
	const orderId = isInPOSRoute ? orderIdFromParams : lastOrderId;

	// The open orders are scoped IN STORAGE by cashier, store and register (#2242, `openOrdersSelector`).
	const { registerId } = useRegisterBinding();
	// Owned HERE, above the Suspense below: the provider only reads it. The owner's retain effect
	// is what starts the read, and a boundary suspending on a handle its own subtree owns never
	// commits that effect (#1707).
	const openOrdersHandle = useOpenOrdersHandle(cashierID, storeID, registerId);

	// Built HERE, above the Suspense below, and handed to the provider — the same placement as
	// the open-orders handle above it and for the same reason: a resource built inside the
	// boundary that suspends on it is discarded with the aborted render and rebuilt by every
	// retry, which never ends (#1707). This layout commits alongside the fallback, so the retry
	// reads back the resource the first attempt already subscribed.
	const { defaultCustomerResource, retry: retryDefaultCustomer } = useDefaultCustomer();

	// The boundary around the Suspense below is this owner's: either read it owns (the open orders,
	// the default customer) can fail into it, so its reset retries both. A remount alone would draw
	// the readers over the same failed handle and resource, which the root boundary cannot rebuild
	// from below this layout.
	const retryOwnedReads = () => {
		openOrdersHandle.retry();
		retryDefaultCustomer();
	};

	// The divergence store sits OUTSIDE the Suspense boundary, deliberately (R1).
	// A save-time money divergence can be acked for an order in a background tab,
	// or while the cart screen is unmounted on a small layout — so the
	// subscription has to outlive them, and the store is keyed by order uuid so
	// the alert surfaces on the tab it belongs to. It must also outlive the
	// BOUNDARY itself: while CurrentOrderProvider suspends on its open-orders
	// handle React never commits effects inside that boundary, and
	// `engine.events()` does not replay, so a drain landing during the initial
	// load would be missed for good.
	//
	// The engine-warning store (#1560) sits beside it for the narrower half of the
	// same reason: the cart's banner and the checkout modal's are two mounts of one
	// notice, so the store has to outlive both. It does NOT need to outlive the
	// BOUNDARY — nothing pushes into it from outside React; every entry comes from
	// an engine call a cart hook just made, below this point.
	return (
		<OrderMoneyDivergenceProvider>
			<OrderEngineWarningsProvider>
				<ErrorBoundary onReset={retryOwnedReads} resetKeys={[openOrdersHandle]}>
					<Suspense>
						<CurrentOrderProvider
							handle={openOrdersHandle}
							scope={`${cashierID}:${storeID}:${registerId}`}
							defaultCustomerResource={defaultCustomerResource}
							currentOrderUUID={orderId}
						>
							<ErrorBoundary>
								{/* Spans both register layouts (tabs, columns): the products screen's query and
								    browse path live here, so a resize across the phone boundary — which
								    mounts the screen afresh in the other tree — keeps the cashier's place. */}
								<PersistedStateProvider>
									<Suspense>
										{/* The command context (roadmap#428): inside the current order, around the stack.
										    The hotkeys bind its commands while the POS is mounted (web and Electron). */}
										<CommandsProvider>
											<Hotkeys />
											<POSStack />
										</CommandsProvider>
									</Suspense>
								</PersistedStateProvider>
							</ErrorBoundary>
						</CurrentOrderProvider>
					</Suspense>
				</ErrorBoundary>
			</OrderEngineWarningsProvider>
		</OrderMoneyDivergenceProvider>
	);
}

/**
 * Deliberately does NOT subscribe to the current order.
 *
 * It used to call `useCurrentOrder()` purely to pass the order down to `TaxRatesProvider`.
 * That put a cart-write subscription ABOVE the navigator, so every add/remove re-rendered
 * this component and the whole `<Stack>` subtree with it — measured at `ProductTile` ×80 per
 * cart mutation. `TaxRatesProvider` now subscribes to the order itself, below this point.
 */
function POSStack() {
	const screenBackgroundColor = useNavigationBackground();
	const insets = useSafeAreaInsets();
	const { theme } = useUniwind();
	const { showUpgrade, setShowUpgrade } = React.useContext(UpgradeNoticeContext);
	const registerPOSContainer = React.useCallback((node: ViewInstance | null) => {
		registerPortalContainer('pos', Platform.OS === 'web' ? (node as unknown as HTMLElement) : null);
	}, []);

	return (
		<TaxRatesProvider>
			<CustomerDisplaySnapshotSource />
			<PosUrlMirror />
			<POSOverlaySideProvider>
				<View
					ref={registerPOSContainer}
					className="bg-background flex-1"
					style={{ paddingTop: insets.top }}
				>
					<SystemBars style={theme === 'light' ? 'dark' : 'light'} />
					{showUpgrade && <UpgradeNotice setShowUpgrade={setShowUpgrade} />}
					<Stack
						screenOptions={{
							animation: 'none',
							headerShown: false,
							contentStyle: { backgroundColor: screenBackgroundColor },
						}}
					>
						<Stack.Screen name="index" />
						<Stack.Screen
							name="(modals)/cart/[orderId]/checkout"
							options={{
								presentation: 'containedTransparentModal',
								animation: 'fade',
								contentStyle: { backgroundColor: 'transparent' },
							}}
						/>
						<Stack.Screen
							name="(modals)/cart/receipt/[orderId]"
							options={{
								presentation: 'containedTransparentModal',
								animation: 'fade',
								contentStyle: { backgroundColor: 'transparent' },
							}}
						/>
					</Stack>
				</View>
				{/**
				 * We need to have the named PortalHost inside the CurrentOrderProvider and TaxRatesProvider
				 * so that dialogs like add/edit product etc can access the context
				 */}
				<ErrorBoundary>
					<PortalHost name="pos" />
				</ErrorBoundary>
			</POSOverlaySideProvider>
		</TaxRatesProvider>
	);
}
