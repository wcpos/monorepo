import * as React from 'react';
import { AccessibilityInfo, View } from 'react-native';

import * as Haptics from 'expo-haptics';
import { useObservableSuspense } from 'observable-hooks';
import Animated, {
	cancelAnimation,
	useAnimatedProps,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { derive, readLedger } from '@wcpos/order-math';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import { Platform } from '@wcpos/utils/platform';

import { useFinishSale } from './use-finish-sale';
import { finishReceipt } from '../checkout-mode';
import { useCheckoutBack } from '../column/use-checkout-back';
import { useEngineRecord } from '../../../hooks/use-engine-document';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';
import { usePaymentMethods } from '../../../hooks/use-payment-methods';
import { ReceiptActions } from '../../../receipt/receipt-actions';
import { ReceiptBody } from '../../../receipt/receipt-body';
import { useReceiptDocument } from '../../../receipt/use-receipt-document';
import { useUISettings } from '../../../contexts/ui-settings';
import { useStoreSession } from '../../../../../contexts/app-state';
import { useT } from '../../../../../contexts/translations';

/** The receipt actions are choices, not the primary action: `New sale` alone is filled. */
function StageAction(props: React.ComponentProps<typeof Button>) {
	return <Button variant="outline" {...props} />;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

function PaidMoment({ children }: { children: React.ReactNode }) {
	// useCSSVariable may yield a number for unitless variables; a stroke needs a colour string.
	const success = String(useCSSVariable('--color-success') ?? '');
	const [reduceMotion, setReduceMotion] = React.useState(true);
	const pop = useSharedValue(0);
	const tick = useSharedValue(30);
	const animation = React.useRef({ pop, tick });
	// Accessibility and haptics are mount-only platform effects. Keep motion off until
	// the async preference resolves, as in the terminal moment.
	React.useEffect(() => {
		const { pop, tick } = animation.current;
		void AccessibilityInfo.isReduceMotionEnabled().then(
			(enabled) => {
				setReduceMotion(enabled);
				if (!enabled) {
					pop.value = withTiming(1, { duration: 400 });
					tick.value = withDelay(150, withTiming(0, { duration: 450 }));
				}
			},
			() => {}
		);
		if (Platform.isNative) {
			void (async () => {
				try {
					await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
				} catch {
					// Missing haptic feedback must not interrupt a recorded sale.
				}
			})();
		}
		return () => {
			cancelAnimation(pop);
			cancelAnimation(tick);
		};
	}, []);
	const style = useAnimatedStyle(() => ({
		opacity: reduceMotion ? 1 : pop.value,
		transform: [{ scale: reduceMotion ? 1 : 0.92 + pop.value * 0.08 }],
	}));
	const animatedProps = useAnimatedProps(() => ({
		strokeDashoffset: reduceMotion ? 0 : tick.value,
	}));
	return (
		<View testID="checkout-paid" className="bg-success w-full">
			<Animated.View testID="receipt-paid-banner" className="items-center gap-3 p-4" style={style}>
				<View className="bg-success-foreground size-[96px] items-center justify-center rounded-full">
					<Svg width={52} height={52} viewBox="0 0 24 24" fill="none">
						<AnimatedPath
							d="M5 12.5l4.5 4.5L19 7.5"
							stroke={success}
							strokeWidth={2.8}
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeDasharray={30}
							animatedProps={animatedProps}
						/>
					</Svg>
				</View>
				{children}
			</Animated.View>
		</View>
	);
}

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
	const { uiSettings } = useUISettings('pos-cart');
	const payload = useRecordField(order, (record) => record.payload);
	const { methods } = usePaymentMethods();
	const { store } = useStoreSession();
	const { format } = useCurrencyFormat({ currencySymbol: payload.currency_symbol });
	const t = useT();
	const rows = readLedger(payload.meta_data);
	const derived = derive(payload.total, rows, methods, {
		dp: store.price_num_decimals ?? 2,
	});
	// A split sale names every method that took money, in ledger order; `derive` only
	// reports the primary one.
	const capturedRows = rows.filter((row) => row.status === 'captured');
	const methodTitles = Array.from(
		new Set(
			capturedRows.map(
				(row) => methods.find((method) => method.id === row.method_id)?.title ?? row.method_id
			)
		)
	);
	const paidWith =
		methodTitles.length > 0 ? methodTitles.join(' + ') : derived.payment_method_title;
	const change = Number(derived.change);
	const paid = Number(derived.paid);
	const cashChange = change > 0 && capturedRows.some((row) => row.method_id === 'pos_cash');
	const paidLine = cashChange
		? t('pos_checkout.paid_tendered_in_cash', {
				paid: format(paid),
				tendered: format(paid + change),
			})
		: paidWith;
	const finishSale = useFinishSale(order.uuid, compact);
	useCheckoutBack(finishSale, { escape: false });
	return (
		<View testID="checkout-receipt-stage" className="flex-1">
			<PaidMoment>
				<View testID="checkout-paid-headline">
					<Text
						testID={change > 0 ? 'receipt-change-due' : undefined}
						className={`text-success-foreground text-center font-bold tabular-nums ${compact ? 'text-3xl' : 'text-4xl'}`}
					>
						{change > 0
							? t('pos_checkout.change_due', { amount: format(change) })
							: t('pos_checkout.paid_amount', { amount: format(paid) })}
					</Text>
				</View>
				<Text testID="receipt-paid-with" className="text-success-foreground text-center">
					{paidLine}
					{capturedRows.length > 1
						? ` · ${t('pos_checkout.payments_taken', { count: capturedRows.length })}`
						: ''}
				</Text>
				{doc.printedTo ? (
					<Text testID="receipt-printed-to" className="text-success-foreground text-center">
						{t('pos_checkout.printed_to', { printer: doc.printedTo })}
					</Text>
				) : null}
			</PaidMoment>
			<View className="min-h-0 flex-1 p-3">
				<ReceiptBody doc={doc} selectsInline={!compact} />
			</View>
			<HStack className="border-border flex-wrap items-center gap-2 border-t p-3">
				<Button
					variant="success"
					size="lg"
					className={compact ? 'w-full' : 'shrink-0'}
					testID="receipt-new-sale"
					onPress={finishSale}
					// With auto-print on, finishing before the receipt data lands would unmount
					// the stage before the configured print ever fires.
					disabled={doc.autoPrintPending}
					loading={doc.autoPrintPending}
				>
					<ButtonText testID="checkout-paid-print">
						{uiSettings.autoPrintReceipt
							? t('pos_checkout.print_receipt_new_sale')
							: t('pos_checkout.new_sale')}
					</ButtonText>
				</Button>
				<ReceiptActions doc={doc} order={order} buttonComponent={StageAction} />
				<Button
					variant="outline"
					className="shrink-0"
					testID="receipt-no-receipt"
					onPress={finishSale}
					disabled={doc.autoPrintPending}
				>
					<ButtonText testID="checkout-paid-none">
						{t('pos_checkout.no_receipt_new_sale')}
					</ButtonText>
				</Button>
			</HStack>
		</View>
	);
}
