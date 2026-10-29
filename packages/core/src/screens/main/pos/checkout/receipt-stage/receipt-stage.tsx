import * as React from 'react';
import { AccessibilityInfo, View } from 'react-native';

import { useObservableSuspense } from 'observable-hooks';
import Animated, {
	cancelAnimation,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from 'react-native-reanimated';

import { STAMP } from '@wcpos/components/lib/motion';
import { Button, ButtonText } from '@wcpos/components/button';
import { AmountFigure } from '@wcpos/components/amount-figure';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { ToneDisc } from '@wcpos/components/tone-disc';
import { activeAwaitingCustomer, derive, isSettledPaymentRow, readLedger } from '@wcpos/order-math';
import { type EngineRecord, useDocField, useRecordField } from '@wcpos/query';
import { Platform } from '@wcpos/utils/platform';
import { useEngineRecord } from '@wcpos/query/record-readers';

import { useFinishSale } from './use-finish-sale';
import { finishReceipt } from '../checkout-mode';
import { useCheckoutBack } from '../column/use-checkout-back';
import { useTerminalLeg } from '../payments/server/use-terminal-leg';
import { CapturedUnfinishedNotice } from '../tender/captured-unfinished-notice';
import { useAwaitsStore } from '../use-awaiting-store';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';
import { usePaymentMethods } from '../../../hooks/use-payment-methods';
import { useReceiptActions } from '../../../receipt/receipt-actions';
import { ReceiptBody } from '../../../receipt/receipt-body';
import { useReceiptDocument } from '../../../receipt/use-receipt-document';
import { useUISettings } from '../../../contexts/ui-settings';
import { useStoreSession } from '../../../../../contexts/app-state';
import { useT } from '../../../../../contexts/translations';

/**
 * The moment after a sale. Paid is green with a tick and a success haptic; sent (contract 1.2,
 * spec §4.2) is the same surface in a neutral state: the money has not arrived, the customer
 * holds the link, so nothing celebrates. Awaiting (ADR 0040 Decided 1 rule 1): the money was
 * taken but the store has not heard the sale, so the disc is the warning wash until it does.
 */
function PaidMoment({
	children,
	sent = false,
	awaiting,
}: {
	children: React.ReactNode;
	sent?: boolean;
	/** null: the journal has not answered yet; the moment waits, unseen, for its tone. */
	awaiting: boolean | null;
}) {
	// The tone the moment first showed: the disc pops again only when it changes (the answer).
	const [firstTone, setFirstTone] = React.useState<boolean | null>(null);
	if (firstTone === null && awaiting !== null) setFirstTone(awaiting);
	const ready = awaiting !== null;
	return (
		<View testID={sent ? 'checkout-sent' : 'checkout-paid'} className="bg-card w-full">
			{/* The till's paid moment, never the store's later answer (ADR 0040 Decided 1 rule 3). */}
			{Platform.isNative && !sent && ready ? <PaidHaptic /> : null}
			{/* Unseen until the tone is known, then ONE pop (never green, then amber); the answer
			    re-pops the disc alone, green, and the headline stays (ADR 0040 Decided 1 rule 1). */}
			<Stamp
				key={String(ready)}
				mode={ready ? 'pop' : 'hold'}
				testID="receipt-paid-banner"
				className="items-center gap-3 p-4"
			>
				<Stamp key={String(awaiting)} mode={awaiting === firstTone ? 'still' : 'pop'}>
					<ToneDisc
						testID="receipt-paid-disc"
						size="lg"
						tone={sent ? 'muted' : awaiting ? 'warning' : 'ok'}
						icon={sent || awaiting ? 'pending' : undefined}
					/>
				</Stamp>
				{children}
			</Stamp>
		</View>
	);
}

/** A sent sale celebrates nothing; a paid one buzzes once, on mount. */
function PaidHaptic() {
	React.useEffect(() => {
		void (async () => {
			try {
				// Pulled in lazily, as play-scan-sound does: a static import of expo-haptics
				// is evaluated at app start and breaks the web build's connect screen.
				// eslint-disable-next-line @typescript-eslint/no-require-imports
				const Haptics = require('expo-haptics') as typeof import('expo-haptics');
				await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
			} catch {
				// Missing haptic feedback must not interrupt a recorded sale.
			}
		})();
	}, []);
	return null;
}

/** A pop, once per mount: `hold` keeps it unseen, `still` shows it without motion. */
function Stamp({
	children,
	mode,
	...props
}: {
	children: React.ReactNode;
	mode: 'hold' | 'still' | 'pop';
	testID?: string;
	className?: string;
}) {
	const [reduceMotion, setReduceMotion] = React.useState<boolean | null>(
		mode === 'still' ? true : null
	);
	const pop = useSharedValue(0);
	const animation = React.useRef({ pop, mode });
	// Accessibility is a mount-only platform effect. Keep motion off until the async preference
	// resolves, as in the terminal moment.
	React.useEffect(() => {
		const { pop, mode } = animation.current;
		if (mode !== 'pop') return;
		void AccessibilityInfo.isReduceMotionEnabled().then(
			(enabled) => {
				setReduceMotion(enabled);
				if (!enabled) {
					pop.value = withTiming(1, { duration: STAMP });
				}
			},
			() => setReduceMotion(true)
		);
		return () => {
			cancelAnimation(pop);
		};
	}, []);
	const style = useAnimatedStyle(() => ({
		opacity: reduceMotion === null ? 0 : reduceMotion ? 1 : pop.value,
		transform: [{ scale: reduceMotion ? 1 : 0.6 + pop.value * 0.4 }],
	}));
	return (
		<Animated.View {...props} style={style}>
			{children}
		</Animated.View>
	);
}

/** `compact`: the routed checkout modal's layout, on every width; the columns cart passes false. */
export function ReceiptStage({ orderUuid, compact }: { orderUuid: string; compact: boolean }) {
	const resource = useEngineRecord('orders', orderUuid);
	const order = useObservableSuspense(resource);
	// A receipt selection that outlives its order (a store switch, a purge) must not strand the
	// POS on a throw: drop the stale selection and let the columns fall back to the cart.
	React.useEffect(() => {
		if (!order) finishReceipt(orderUuid);
	}, [order, orderUuid]);
	if (!order) return null;
	return <ReceiptStageDocument key={orderUuid} order={order} compact={compact} />;
}

function ReceiptStageDocument({
	order,
	compact,
}: {
	order: EngineRecord<'orders'>;
	compact: boolean;
}) {
	const doc = useReceiptDocument({ order, autoPrintAllowed: true });
	const { sync, choices, dialog } = useReceiptActions(doc, order);
	const actions = sync ? [sync, ...choices] : choices;
	const leg = useTerminalLeg(order.uuid);
	const { uiSettings } = useUISettings('pos-cart');
	const payload = useRecordField(order, (record) => record.payload);
	const { methods } = usePaymentMethods();
	const { store } = useStoreSession();
	// The latest store document, not the session's snapshot (see use-tender-flow).
	const dp = useDocField(store, (value) => value.price_num_decimals) ?? 2;
	const { format } = useCurrencyFormat({ currencySymbol: payload.currency_symbol });
	const t = useT();
	const rows = readLedger(payload.meta_data);
	const derived = derive(payload.total, rows, methods, { dp });
	// A split sale names every method that took money, in ledger order; `derive` only
	// reports the primary one.
	const settledRows = rows.filter(isSettledPaymentRow);
	const methodTitles = Array.from(
		new Set(
			settledRows.map(
				(row) => methods.find((method) => method.id === row.method_id)?.title ?? row.method_id
			)
		)
	);
	const paidWith =
		methodTitles.length > 0 ? methodTitles.join(' + ') : derived.payment_method_title;
	const change = Number(derived.change);
	const paid = Number(derived.paid);
	const cashRows = settledRows.filter((row) => row.kind === 'cash');
	const cashTendered = cashRows.reduce(
		(total, row) => total + Number(row.tendered ?? row.amount),
		0
	);
	const cashChange = change > 0 && cashRows.length > 0;
	const paidLine = cashChange
		? t('pos_checkout.paid_tendered_in_cash', {
				paid: format(paid),
				tendered: format(cashTendered),
			})
		: paidWith;
	const finishSale = useFinishSale(order.uuid, compact ? 'modal' : 'columns');
	useCheckoutBack(finishSale, { escape: false });
	// Sent (spec §4.2): the stamp is on the order and no money has been taken.
	const stamp = activeAwaitingCustomer(payload.meta_data);
	const sent = stamp && Number(derived.balance) > 0 ? stamp : null;
	const awaitsStore = useAwaitsStore(order.uuid);
	const awaiting = sent ? false : awaitsStore;
	const newSale = (
		<Button
			variant="default"
			size="lg"
			className={compact ? 'w-full' : 'shrink-0'}
			testID={sent ? 'checkout-sent-new' : 'receipt-new-sale'}
			onPress={finishSale}
			// With auto-print on, finishing before the receipt data lands would unmount
			// the stage before the configured print ever fires.
			disabled={doc.autoPrintPending}
			loading={doc.autoPrintPending}
		>
			<ButtonText testID={sent ? 'checkout-sent-print' : 'checkout-paid-print'}>
				{uiSettings.autoPrintReceipt
					? t('pos_checkout.print_receipt_new_sale')
					: t('pos_checkout.new_sale')}
			</ButtonText>
		</Button>
	);
	return (
		<View testID="checkout-receipt-stage" className="bg-card flex-1">
			{leg?.outcome === 'captured' && leg.settlement?.finishingError ? (
				<CapturedUnfinishedNotice finishingError={leg.settlement.finishingError} />
			) : null}
			<PaidMoment sent={sent !== null} awaiting={awaiting}>
				<View testID={sent ? 'checkout-sent-headline' : 'checkout-paid-headline'}>
					<AmountFigure testID={change > 0 ? 'receipt-change-due' : undefined} center>
						{sent
							? t('pos_checkout.invoice_sent')
							: change > 0
								? t('pos_checkout.change_due', { amount: format(change) })
								: t('pos_checkout.paid_amount', { amount: format(paid) })}
					</AmountFigure>
				</View>
				<Text testID="receipt-paid-with" className="text-muted-foreground text-center">
					{awaiting ? (
						<Text testID="receipt-awaiting-store" className="text-warning-text">
							{`${t('pos_checkout.awaiting_store')} · `}
						</Text>
					) : null}
					{sent
						? sent.destination
							? t('pos_checkout.sent_to_amount_due', {
									destination: sent.destination,
									amount: format(Number(derived.balance)),
								})
							: t('pos_checkout.sent_amount_due', { amount: format(Number(derived.balance)) })
						: paidLine}
					{!sent && settledRows.length > 1
						? ` · ${t('pos_checkout.payments_taken', { count: settledRows.length })}`
						: ''}
				</Text>
				{doc.printedTo ? (
					<Text testID="receipt-printed-to" className="text-muted-foreground text-center">
						{t('pos_checkout.printed_to', { printer: doc.printedTo })}
					</Text>
				) : null}
			</PaidMoment>
			<View className="min-h-0 flex-1 p-3">
				<ReceiptBody doc={doc} selectsInline={!compact} />
			</View>
			<HStack className="border-border flex-wrap items-center gap-2 border-t p-3">
				{/* The footer's one intent: rightmost on a wide pane, first (full width) on a phone. */}
				{compact ? newSale : null}
				{/* The receipt actions are choices, not the primary action: New sale alone is filled. */}
				{actions.map(({ label, icon, ...action }) => (
					<Button key={action.testID} variant="outline" leftIcon={icon} {...action}>
						{label}
					</Button>
				))}
				{compact ? null : newSale}
			</HStack>
			{dialog}
		</View>
	);
}
