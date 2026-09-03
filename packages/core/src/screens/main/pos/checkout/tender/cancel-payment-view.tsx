import * as React from 'react';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { toMinor } from '@wcpos/order-math';

import { useT } from '../../../../../contexts/translations';

import type { TenderFlow } from './use-tender-flow';

interface Props {
	flow: TenderFlow;
	format: (minor: number) => string;
}

/**
 * Cancelling mid-split is a physical act before it is a database one: the cash in
 * the drawer has to come back out. So the screen lists what has to be returned or
 * voided, leg by leg, before it will void anything.
 */
export function CancelPaymentView({ flow, format }: Props) {
	const t = useT();

	return (
		<VStack space="md" className="mx-auto max-w-md p-4">
			<Text className="text-lg font-semibold">{t('pos_checkout.cancel_payment_question')}</Text>
			{flow.liveRows.length === 0 ? (
				<Text className="text-muted-foreground text-sm">{t('pos_checkout.nothing_taken_yet')}</Text>
			) : (
				<VStack space="xs">
					<Text className="text-muted-foreground text-sm">
						{t('pos_checkout.money_taken_has_to_go_back')}
					</Text>
					{flow.liveRows.map((row) => {
						const amount = format(toMinor(row.amount, flow.dp));
						const title =
							flow.tiles.find(({ method }) => method.id === row.method_id)?.method.title ??
							row.method_id;

						return (
							<Text
								key={row.id}
								testID={`checkout-cancel-leg-${row.id}`}
								className="border-border bg-background rounded-md border p-2 text-sm"
								decodeHtml
							>
								{row.kind === 'cash'
									? t('pos_checkout.return_cash', { amount })
									: t('pos_checkout.void_on_method', { amount, title })}
							</Text>
						);
					})}
				</VStack>
			)}
			<HStack className="justify-end gap-2">
				<Button
					variant="outline"
					testID="checkout-cancel-keep-going"
					disabled={flow.busy}
					onPress={() => flow.dispatch({ type: 'back' })}
				>
					<ButtonText>{t('pos_checkout.keep_taking_payment')}</ButtonText>
				</Button>
				<Button
					variant="destructive"
					testID="checkout-cancel-confirm"
					loading={flow.busy}
					disabled={flow.busy}
					onPress={() => void flow.cancelPayment()}
				>
					<ButtonText>{t('pos_checkout.cancel_and_void')}</ButtonText>
				</Button>
			</HStack>
		</VStack>
	);
}
