import * as React from 'react';
import { View } from 'react-native';

import { useObservableSuspense } from 'observable-hooks';

import { Button, ButtonGroupSeparator } from '@wcpos/components/button';
import { Card, CardContent, CardHeader } from '@wcpos/components/card';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { HStack } from '@wcpos/components/hstack';
import { VStack } from '@wcpos/components/vstack';
import { type EngineRecord, useDocField } from '@wcpos/query';
import './register-cart-bar-entries';
import { Text } from '@wcpos/components/text';

import { type ReadonlyView, Slot, type SlotContracts } from '../../../../extensions/slots';
import { useUISettings } from '../../contexts/ui-settings';
import { OrderMetaButton, OrderMetaDialog } from './buttons/order-meta';
import { PayButton } from './buttons/pay';
import { SaveButton } from './buttons/save-order';
import { VoidButton } from './buttons/void';
import { useEngineRecord } from '../../hooks/use-engine-document';
import { CheckoutLedger } from './checkout-ledger';
import { useOrderCheckoutStage } from '../checkout/checkout-mode';
import { CartHeader } from './cart-header';
import { useCartSettlement } from '../hooks/use-cart-settlement';
import { CartTable } from './table';
import { Totals } from './totals';
import { useT } from '../../../../contexts/translations';
import { useRegisterBinding } from '../../../../services/register/use-register-binding';
import { OpenRegisterCard, RegisterCount } from './open-register-card';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { RegisterBar } from './register-bar';
import { RegisterPicker } from './register-picker';
import { CartTotalsChangedBanner } from './totals-changed-banner';
import { type CurrentOrderRecord, useCurrentOrder } from '../contexts/current-order';

const NO_API: SlotContracts['pos.cart.bar']['api'] = {};
const NEVER_CHANGES = () => () => {};

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
	const { sessionsOn, session, overdue } = useRegisterSession();
	const [panelOpen, setPanelOpen] = React.useState(false);
	const [pickingRegister, setPickingRegister] = React.useState(false);
	const t = useT();

	const { currentOrderRecord } = useCurrentOrder();
	// Keep the dialog mounted on its original order while a send changes the open-order list.
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
	const cartBar = <Slot id="pos.cart.bar" api={NO_API} data={view} />;

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
	return (
		<VStack className={`h-full gap-1 p-2 ${isColumn && 'pl-0'}`}>
			<RegisterBar
				onSwitchRegister={() => setPickingRegister(true)}
				panelOpen={panelOpen}
				onPanelOpenChange={setPanelOpen}
			/>
			{process.env.EXPO_PUBLIC_WCPOS_E2E === '1' &&
				React.createElement(
					(
						require('../../../../../e2e/cart-add-timing-readout') as typeof import('../../../../../e2e/cart-add-timing-readout')
					).CartAddTimingReadout
				)}
			{position === 'top' && cartBar}
			{bindingStatus === 'none' && <Text>{t('register.no_register_for_store')}</Text>}
			<ErrorBoundary>
				{bindingStatus === 'choose' || pickingRegister ? (
					<RegisterPicker onBound={() => setPickingRegister(false)} />
				) : sessionsOn && !session && bindingStatus === 'bound' ? (
					<OpenRegisterCard />
				) : session?.status === 'counting' ? (
					<RegisterCount />
				) : isColumn && receiptOrderUuid ? (
					<React.Suspense fallback={null}>
						<ReceiptLedger uuid={receiptOrderUuid} />
					</React.Suspense>
				) : isColumn && !isNewOrder && stage === 'checkout' ? (
					<CheckoutLedger order={currentOrderRecord as EngineRecord<'orders'>} />
				) : isNewOrder ? (
					<Card className="flex-1">
						<CardHeader className="bg-card-header p-2">
							<ErrorBoundary>
								<CartHeader />
							</ErrorBoundary>
						</CardHeader>
						<CardContent className="flex-1 p-0" />
						{overdue && (
							<Button
								testID="checkout-close-register"
								className="min-h-14"
								onPress={() => setPanelOpen(true)}
							>
								{t('register.close_register')}
							</Button>
						)}
					</Card>
				) : (
					<Card className="flex-1">
						<CardHeader className="bg-card-header p-2">
							<ErrorBoundary>
								<CartHeader />
							</ErrorBoundary>
						</CardHeader>
						<CardContent className="border-border flex-1 border-t p-0">
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
							<HStack className="bg-footer p-2">
								<View className="flex-1">
									<OrderMetaButton onPress={() => setEditingOrder(currentOrderRecord)} />
								</View>
								<View className="flex-1">
									<SaveButton />
								</View>
							</HStack>
							<HStack className="w-full gap-0">
								<ErrorBoundary>
									<VoidButton />
									<ButtonGroupSeparator className="bg-card-header" />
									{sessionsOn && !session ? (
										<Button
											testID="checkout-open-register"
											className="min-h-14 flex-1"
											onPress={() => setPickingRegister(true)}
										>
											{t('register.open_register')}
										</Button>
									) : overdue && !currentOrderRecord.payload.line_items?.length ? (
										<Button
											testID="checkout-close-register"
											className="min-h-14 flex-1"
											onPress={() => setPanelOpen(true)}
										>
											{t('register.close_register')}
										</Button>
									) : (
										<PayButton />
									)}
								</ErrorBoundary>
							</HStack>
						</CardContent>
					</Card>
				)}
			</ErrorBoundary>
			<OrderMetaDialog
				order={editingOrder}
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
