import * as React from 'react';
import { View } from 'react-native';

import { useIsFocused } from 'expo-router/react-navigation';
import { useObservableSuspense } from 'observable-hooks';

import { Button } from '@wcpos/components/button';
import { EmptyState } from '@wcpos/components/empty-state';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Skeleton } from '@wcpos/components/skeleton';
import { cn } from '@wcpos/components/lib/utils';
import { VStack } from '@wcpos/components/vstack';
import { type EngineRecord, useDocField } from '@wcpos/query';
import './register-cart-bar-entries';
import { useEngineRecord } from '@wcpos/query/record-readers';

import { useRegisterSurface } from '../../../../extensions/commands/use-register-surface';
import { type ReadonlyView, Slot, type SlotContracts } from '../../../../extensions/slots';
import { useUISettings } from '../../contexts/ui-settings';
import { StilledCart } from './stilled-cart';
import { useOrderCheckoutStage } from '../checkout/checkout-mode';
import { CartHeader } from './cart-header';
import { useVoidOrder } from '../hooks/use-void-order';
import { CartTable } from './table';
import { CartFoot } from './foot';
import { OrderSheet } from './order-sheet';
import { Totals } from './totals';
import { useT } from '../../../../contexts/translations';
import { useRegisterBinding } from '../../../../services/register/use-register-binding';
import { OpenRegisterCard } from './open-register-card';
import { RegisterCount } from './register-count';
import { type ClosureCount, ClosureSheet } from './closure-sheet';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { RegisterBar } from './register-bar';
import { SessionHoldBanner } from '../../components/session-hold-banner';
import { useTitleBarStrip } from '../../../../contexts/title-bar-strip';
import { TitleBarStripPortal } from '../../../../contexts/title-bar-strip/portal';
import { RegisterPicker } from './register-picker';
import { RegisterGateCard } from './register-gate-card';
import {
	consumeRegisterPickerRequest,
	useRegisterPickerRequested,
} from './register-picker-request';
import { CartTotalsChangedBanner } from './totals-changed-banner';
import { CartConditionsNotice } from './conditions-notice';
import { CartConditionsProvider } from '../conditions/use-cart-conditions';
import { type CurrentOrderRecord, useCurrentOrder } from '../contexts/current-order';

const NEVER_CHANGES = () => () => {};
const NOOP = () => undefined;
const LOADING_ROWS = (
	<View testID="cart-column-loading" className="gap-2 p-2">
		{[0, 1, 2].map((row) => (
			<Skeleton key={row} shape="row" />
		))}
	</View>
);

export function OpenOrders(props: React.ComponentProps<typeof CartColumn>) {
	return (
		<CartConditionsProvider>
			<CartColumn {...props} />
		</CartConditionsProvider>
	);
}

function CartColumn({
	isColumn = false,
	receiptOrderUuid,
}: {
	isColumn?: boolean;
	receiptOrderUuid?: string;
}) {
	const { status: bindingStatus, failed, retrying, retry } = useRegisterBinding();
	const { sessionsOn, session, loaded, overdue } = useRegisterSession();
	// Until the session loads, an open register reads as closed; show neither card nor cart.
	const sessionLoading = sessionsOn && !loaded && bindingStatus === 'bound';
	const [closure, setClosure] = React.useState<ClosureCount | null>(null);
	const [panelOpen, setPanelOpen] = React.useState(false);
	const [pickingRegister, setPickingRegister] = React.useState(false);
	// The open-orders list slides over the cart. Covered, the cart leaves the tab order and
	// the accessibility tree: a keyboard or screen-reader user must not reach a line, a total
	// or the checkout button behind the list. The strip stays reachable to close it.
	const [cartCovered, setCartCovered] = React.useState(false);
	const barApi = React.useMemo<SlotContracts['pos.cart.bar']['api']>(
		() => ({
			setCartCovered: async (covered) => {
				setCartCovered(covered);
			},
		}),
		[]
	);
	// The rail's cashier sheet asks for the picker from outside this screen: the request is
	// read as state and consumed when the picker binds.
	const pickerRequested = useRegisterPickerRequested();
	const t = useT();

	const { currentOrderRecord } = useCurrentOrder();
	// Keep the sheet mounted on its original order while a send changes the open-order list.
	const [editingOrder, setEditingOrder] = React.useState<CurrentOrderRecord | null>(null);
	// `pos.cart.void` runs the void path while the cart column is mounted, sheet open or not; a
	// void from a key closes the sheet first, as the sheet's own Void button does (roadmap#428).
	const { voidOrder } = useVoidOrder({ onBeforeVoid: () => setEditingOrder(null) });
	useRegisterSurface('void', voidOrder);
	const stage = useOrderCheckoutStage(currentOrderRecord);
	const { uiSettings } = useUISettings('pos-cart');
	const position = useDocField(uiSettings, (value) => value.openOrdersPosition);
	const view = React.useMemo<ReadonlyView<SlotContracts['pos.cart.bar']['value']>>(
		() => ({
			value: { position: position === 'top' ? 'top' : 'bottom', isColumn },
			subscribe: NEVER_CHANGES,
		}),
		[position, isColumn]
	);
	// The open-order tabs belong to the cart: while the column shows the register picker, the
	// Open register card or the count instead, the tabs go with it (Paul, 2026-09-29).
	// No register answered for this store, or the directory could not be read while unbound:
	// the column is the gate card (board 2A, 2026-10-21). The open-order tabs stay: open carts are allowed.
	const gateFailed = (bindingStatus === 'unknown' && failed) || retrying === 'failed';
	const gateShown = bindingStatus === 'none' || retrying === 'none' || gateFailed;
	const cartShown =
		!gateShown &&
		!(bindingStatus === 'choose' || pickingRegister || pickerRequested) &&
		!sessionLoading &&
		!(sessionsOn && !session && bindingStatus === 'bound') &&
		!(session && session.status !== 'open');
	const cartBar =
		cartShown || gateShown ? <Slot id="pos.cart.bar" api={barApi} data={view} /> : null;
	// The cart commands' `inCart` reads this: the column is mounted behind the picker, the card and
	// the count too, and a key must not void or switch an order the cashier cannot see (#428).
	// Shown AND not covered by the open-orders list (inert, out of the accessibility tree).
	// …and the screen holding it focused: the phone tabs keep the cart mounted behind Products.
	const screenFocused = useIsFocused();
	useRegisterSurface('cart', NOOP, cartShown && !cartCovered && screenFocused);

	if (!currentOrderRecord) {
		throw new Error('Current order is not defined');
	}

	const isNewOrder = (currentOrderRecord as { isNew?: boolean }).isNew;

	/**
	 * Remember the draft (unsaved) order's uuid. The first add saves the draft
	 * under the SAME uuid and only then mounts CartTable — with the line already
	 * in its data — so the table alone cannot tell that row apart from an
	 * existing order's rows. This ref lets it pulse the first add too.
	 */
	const lastDraftOrderUuidRef = React.useRef<string | undefined>(undefined);
	React.useEffect(() => {
		// This runs AFTER CartTable's effects in the same commit (parent effects
		// follow child effects), so on the commit where the draft becomes a real
		// order the table reads the uuid first, then it is cleared here.
		lastDraftOrderUuidRef.current = isNewOrder ? currentOrderRecord.uuid : undefined;
	});

	/**
	 *
	 */
	// The desktop's title-bar strip is the till's topmost row: with the strip visible and
	// the cart in its column, the register bar renders INTO the strip (prototype
	// 2026-09-30-phone-md-chrome, desktop 7). Web, tablet and phone have no strip.
	const strip = useTitleBarStrip();
	const barInStrip = isColumn && strip.node !== null;
	const registerBar = (
		<RegisterBar
			onSwitchRegister={() => setPickingRegister(true)}
			panelOpen={panelOpen}
			onPanelOpenChange={setPanelOpen}
			strip={barInStrip}
		/>
	);
	// The cart has no frame of its own: the register bar, the customer row and the foot run their
	// hairlines to the column's edges (Paul, 2026-10-09), and on the phone to the screen's (Paul,
	// 2026-10-23: the tab had kept an 8 inset that drew a frame around the rows). The column
	// paints the card colour; the phone tab stays on the ground, as the products tab does, because
	// the tabs container pads the status bar in `bg-background` (columns ledger line 6: no band),
	// and the rows, the totals and the open-order tabs paint their own card colour.
	return (
		<VStack className={cn('h-full gap-0', isColumn ? 'bg-card' : 'bg-background')}>
			{barInStrip ? <TitleBarStripPortal>{registerBar}</TitleBarStripPortal> : registerBar}
			<SessionHoldBanner gutter="dense" />
			{process.env.EXPO_PUBLIC_WCPOS_E2E === '1' &&
				React.createElement(
					(
						require('../../../../../e2e/cart-add-timing-readout') as typeof import('../../../../../e2e/cart-add-timing-readout')
					).CartAddTimingReadout
				)}
			{position === 'top' && cartBar}
			<View
				testID="cart-column-body"
				className="min-h-0 flex-1"
				aria-hidden={cartCovered}
				// `inert` is a web attribute (RN-web forwards it); native has only the a11y hide.
				{...(cartCovered ? { inert: true } : {})}
			>
				<ErrorBoundary>
					{gateShown ? (
						<RegisterGateCard failed={gateFailed} retry={retry} />
					) : bindingStatus === 'choose' || pickingRegister || pickerRequested ? (
						<RegisterPicker
							onBound={() => {
								setPickingRegister(false);
								consumeRegisterPickerRequest();
							}}
						/>
					) : sessionLoading ? (
						LOADING_ROWS
					) : sessionsOn && !session && bindingStatus === 'bound' ? (
						<OpenRegisterCard onLastClosure={() => setPanelOpen(true)} />
					) : session && session.status !== 'open' ? (
						<RegisterCount key={session.id} onClosed={setClosure} />
					) : isColumn && receiptOrderUuid ? (
						<React.Suspense fallback={LOADING_ROWS}>
							<ReceiptLedger uuid={receiptOrderUuid} />
						</React.Suspense>
					) : isColumn && !isNewOrder && (stage === 'checkout' || stage === 'receipt') ? (
						<StilledCart order={currentOrderRecord as EngineRecord<'orders'>} />
					) : isNewOrder ? (
						<View className="flex-1">
							<ErrorBoundary>
								<CartHeader />
							</ErrorBoundary>
							<EmptyState
								kind="empty"
								icon="cart"
								testID="cart-empty"
								title={t('pos_cart.empty_cart_hint')}
							/>
							{overdue && (
								<Button
									testID="checkout-close-register"
									size="lg"
									onPress={() => setPanelOpen(true)}
								>
									{t('register.close_register')}
								</Button>
							)}
						</View>
					) : (
						<View className="flex-1">
							<ErrorBoundary>
								<CartHeader />
							</ErrorBoundary>
							<View className="flex-1">
								<View className="flex-1">
									<ErrorBoundary>
										<CartTable lastDraftOrderUuidRef={lastDraftOrderUuidRef} />
									</ErrorBoundary>
								</View>
								<ErrorBoundary>
									<CartTotalsChangedBanner />
								</ErrorBoundary>
								<ErrorBoundary>
									<CartConditionsNotice />
								</ErrorBoundary>
								<ErrorBoundary>
									<Totals />
								</ErrorBoundary>
								<CartFoot
									onOpenRegister={() => setPickingRegister(true)}
									onCloseRegister={() => setPanelOpen(true)}
									onOpenSheet={() => setEditingOrder(currentOrderRecord)}
								/>
							</View>
						</View>
					)}
				</ErrorBoundary>
			</View>
			{closure && !session && <ClosureSheet {...closure} onDone={() => setClosure(null)} />}
			<OrderSheet
				open={editingOrder !== null}
				order={editingOrder ?? currentOrderRecord}
				onOpenChange={(open) => {
					if (!open) setEditingOrder(null);
				}}
			/>
			{position !== 'top' && cartBar}
		</VStack>
	);
}

function ReceiptLedger({ uuid }: { uuid: string }) {
	const resource = useEngineRecord('orders', uuid);
	const order = useObservableSuspense(resource);
	// The receipt stage in the other column drops the stale selection; render nothing meanwhile.
	if (!order) return null;
	return <StilledCart order={order} />;
}
