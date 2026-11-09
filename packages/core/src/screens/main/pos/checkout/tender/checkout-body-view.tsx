import * as React from 'react';
import { View } from 'react-native';

import { Button, ButtonText } from '@wcpos/components/button';
import { SegmentedControl } from '@wcpos/components/segmented-control';
import { Text } from '@wcpos/components/text';
import { type EngineRecord } from '@wcpos/query';

import { CancelPaymentView } from './cancel-payment-view';
import { checkoutBodyFor, offersCancelPayment } from './checkout-body';
import { LegacyTab } from './legacy-tab';
import { UnansweredGate } from './tender-pane';
import { useT } from '../../../../../contexts/translations';

import type { TenderFlow } from './use-tender-flow';

interface BodyProps {
	flow: TenderFlow;
	order: EngineRecord<'orders'>;
	format: (minor: number) => string;
	/** Where the Legacy tab paints its receipt; the column keeps it in the pane. */
	receiptHost?: 'stage';
	/** The host's own layout of the tender pane, the ladder's last rung. */
	pane: React.ReactNode;
}

/** The rung `checkoutBodyFor` picks, drawn the same in both hosts; only the pane is theirs. */
export function CheckoutBodyView({ flow, order, format, receiptHost, pane }: BodyProps) {
	const t = useT();
	switch (checkoutBodyFor(flow)) {
		case 'gate':
			return <UnansweredGate flow={flow} />;
		case 'cancel':
			return <CancelPaymentView flow={flow} format={format} />;
		case 'legacy':
			return <LegacyTab flow={flow} order={order} receiptHost={receiptHost} />;
		case 'done':
			return (
				<View className="p-4">
					<Button
						// The sale button: primary, never green (green is a status colour, not an action).
						size="lg"
						testID="checkout-complete-order"
						loading={flow.running === 'takeTender'}
						disabled={flow.busy}
						onPress={() => void flow.takeTender()}
					>
						<ButtonText>{t('common.done')}</ButtonText>
					</Button>
				</View>
			);
		case 'pane':
			return <>{pane}</>;
	}
}

type TabsProps = { flow: TenderFlow; hug: boolean; className?: string };

/** Payments | Legacy, with the whole-bill line while a leg is live (Legacy pays the whole bill). */
export function TenderTabs({ flow, hug, className }: TabsProps) {
	const t = useT();
	return (
		<View className={className}>
			<SegmentedControl
				hug={hug}
				value={flow.state.tab}
				onValueChange={(tab) => flow.dispatch({ type: 'set-tab', tab: tab as 'payments' })}
				segments={[
					{
						value: 'payments',
						label: t('pos_checkout.payments_tab'),
						testID: 'checkout-tab-payments',
					},
					{ value: 'legacy', label: t('pos_checkout.legacy_tab'), testID: 'checkout-tab-legacy' },
				]}
			/>
			{flow.hasLiveLeg ? (
				<Text variant="help" className="text-right" testID="checkout-legacy-whole-bill">
					{t('pos_checkout.whole_bill_only')}
				</Text>
			) : null}
		</View>
	);
}

/** The header's Cancel payment, shown by `offersCancelPayment`. */
export function CancelPaymentButton({ flow, size }: { flow: TenderFlow; size?: 'sm' }) {
	const t = useT();
	if (!offersCancelPayment(flow)) return null;
	return (
		<Button
			variant="outline-destructive"
			size={size}
			testID="checkout-cancel-payment"
			// The flow drops every action while a payment is in progress; the button says so.
			disabled={flow.busy}
			onPress={() => flow.dispatch({ type: 'request-cancel' })}
		>
			<ButtonText>{t('pos_checkout.cancel_payment')}</ButtonText>
		</Button>
	);
}
