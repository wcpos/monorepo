import * as React from 'react';

import { useRouter } from 'expo-router';
import { useObservableState } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { useIsPhone } from '@wcpos/components/lib/device';
import { cn } from '@wcpos/components/lib/utils';
import { Notice } from '@wcpos/components/notice';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import {
	observePaymentAttention,
	type PaymentAttentionEntry,
	resolvePaymentAttention,
} from '@wcpos/query/store-local';

import { useGround } from '../components/ground';
import { useStoreSession } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';

const NONE: PaymentAttentionEntry[] = [];

/**
 * The sales the store refused a payment on (ADR 0040 Decided 1 rule 4: one failed story, in
 * Orders, with the reason). The row under the page bar, in the hold banner's slot and gutter; full
 * width on a phone. Each entry offers Open order and Handled, and never a Retry: a refused row is
 * never retried on its own, the cashier settles it (a refund, or the balance) and says so.
 */
export function PaymentAttentionNotice() {
	const { storeDB } = useStoreSession();
	const entries = useObservableState(
		React.useMemo(() => observePaymentAttention(storeDB), [storeDB]),
		NONE
	);
	const t = useT();
	const router = useRouter();
	const phone = useIsPhone();
	const ground = useGround();
	if (entries.length === 0) return null;

	return (
		<Notice
			tone="bad"
			testID="orders-attention"
			title={t('orders.attention', { count: entries.length })}
			className={cn(!phone && cn(ground.mx, ground.mt))}
		>
			<VStack className="mt-1 gap-1">
				{entries.map((entry) => (
					<HStack
						key={entry.rowId}
						testID={`orders-attention-row-${entry.rowId}`}
						className="flex-wrap items-center gap-2"
					>
						<Text className="text-muted-foreground min-w-0 flex-1 basis-48">
							{t('orders.attention_row', {
								// The refusal copy's fallback when the order has no number yet.
								number: entry.orderNumber || entry.orderUuid.slice(0, 8),
								amount: entry.amount,
								method: entry.methodTitle,
								message: entry.message,
							})}
						</Text>
						<HStack className="gap-1">
							<Button
								variant="ghost"
								size="sm"
								testID={`orders-attention-open-${entry.rowId}`}
								// As a row opens it: the order's pane on this page.
								onPress={() => router.setParams({ order: entry.orderUuid })}
							>
								<ButtonText>{t('orders.attention_open')}</ButtonText>
							</Button>
							<Button
								variant="ghost"
								size="sm"
								testID={`orders-attention-handled-${entry.rowId}`}
								// A failed write leaves the row showing: the cashier sees it was not taken.
								onPress={() => void resolvePaymentAttention(storeDB, entry.rowId).catch(() => {})}
							>
								<ButtonText>{t('orders.attention_handled')}</ButtonText>
							</Button>
						</HStack>
					</HStack>
				))}
			</VStack>
		</Notice>
	);
}
