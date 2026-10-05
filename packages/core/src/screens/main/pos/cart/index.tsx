import * as React from 'react';
import { View } from 'react-native';

import { useObservableSuspense } from 'observable-hooks';

import { Button } from '@wcpos/components/button';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Skeleton } from '@wcpos/components/skeleton';
import { VStack } from '@wcpos/components/vstack';
import { type EngineRecord, useDocField } from '@wcpos/query';
import './register-cart-bar-entries';
import { Text } from '@wcpos/components/text';

import { type ReadonlyView, Slot, type SlotContracts } from '../../../../extensions/slots';
import { useUISettings } from '../../contexts/ui-settings';
import { useEngineRecord } from '../../hooks/use-engine-document';
import { CheckoutLedger } from './checkout-ledger';
import { useOrderCheckoutStage } from '../checkout/checkout-mode';
import { CartHeader } from './v2/cart-header';
import { useCartSettlement } from '../hooks/use-cart-settlement';
import { CartTable } from './v2/table';
import { CartFoot } from './v2/foot';
import { OrderSheet } from './v2/order-sheet';
import { Totals } from './totals';
import { useT } from '../../../../contexts/translations';
import { useRegisterBinding } from '../../../../services/register/use-register-binding';
import { OpenRegisterCard } from './open-register-card';
import { RegisterCount } from './register-count';
import { type ClosureCount, ClosureSheet } from './closure-sheet';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { RegisterBar } from './register-bar';
import { useTitleBarStrip } from '../../../../contexts/title-bar-strip';
import { TitleBarStripPortal } from '../../../../contexts/title-bar-strip/portal';
import { RegisterPicker } from './register-picker';
import {
	consumeRegisterPickerRequest,
	useRegisterPickerRequested,
} from './register-picker-request';
import { CartTotalsChangedBanner } from './totals-changed-banner';
import { type CurrentOrderRecord, useCurrentOrder } from '../contexts/current-order';

const NEVER_CHANGES = () => () => {};
const LOADING_ROWS = (
	<View testID="cart-column-loading" className="gap-2 p-2">
		{[0, 1, 2].map((row) => (
			<Skeleton key={row} shape="row" />
		))}
	</View>
);

export function OpenOrders({
	isColumn = false,
	receiptOrderUuid,
}: {
	isColumn?: boolean;
	receiptOrderUuid?: string;
}) {
	// The cart's single writer. Mounted HERE, once, because CartTable, Totals and
	// useOrderTotals below all mount useCartLines — and settlement state must not be
	// duplicated across them. Keep it mounted in checkout too: swapping the cart
	// for the ledger must not remove its single settlement writer. See use-cart-settlement.ts.
	useCartSettlement();
	const { status: bindingStatus } = useRegisterBinding();
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
		() => ({ setCartCovered }),
		[]
	);
	// The rail's cashier sheet asks for the picker from outside this screen: the request is
	// read as state and consumed when the picker binds.
	const pickerRequested = useRegisterPickerRequested();
	const t = useT();

	const { currentOrderRecord } = useCurrentOrder();
	// Keep the sheet mounted on its original order while a send changes the open-order list.
	const [editingOrder, setEditingOrder] = React.useState<CurrentOrderRecord | null>(null);
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
	const cartShown =
		!(bindingStatus === 'choose' || pickingRegister || pickerRequested) &&
		!sessionLoading &&
		!(sessionsOn && !session && bindingStatus === 'bound') &&
		!(session && session.status !== 'open');
	const cartBar = cartShown ? <Slot id="pos.cart.bar" api={barApi} data={view} /> : null;

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
	return (
		<VStack className={`h-full gap-1 p-2 ${isColumn ? 'bg-card pl-0' : ''}`}>
			{barInStrip ? <TitleBarStripPortal>{registerBar}</TitleBarStripPortal> : registerBar}
			{process.env.EXPO_PUBLIC_WCPOS_E2E === '1' &&
				React.createElement(
					(
						require('../../../../../e2e/cart-add-timing-readout') as typeof import('../../../../../e2e/cart-add-timing-readout')
					).CartAddTimingReadout
				)}
			{position === 'top' && cartBar}
			{bindingStatus === 'none' && <Text>{t('register.no_register_for_store')}</Text>}
			<View
				testID="cart-column-body"
				className="min-h-0 flex-1"
				aria-hidden={cartCovered}
				// `inert` is a web attribute (RN-web forwards it); native has only the a11y hide.
				{...(cartCovered ? { inert: true } : {})}
			>
				<ErrorBoundary>
					{bindingStatus === 'choose' || pickingRegister || pickerRequested ? (
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
					) : isColumn && !isNewOrder && stage === 'checkout' ? (
						<CheckoutLedger order={currentOrderRecord as EngineRecord<'orders'>} />
					) : isNewOrder ? (
						<View className="flex-1">
							<ErrorBoundary>
								<CartHeader />
							</ErrorBoundary>
							<View className="flex-1" />
							{overdue && (
								<Button
									testID="checkout-close-register"
									className="min-h-14"
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
	return <CheckoutLedger order={order} />;
}
