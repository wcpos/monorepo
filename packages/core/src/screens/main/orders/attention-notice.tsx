import * as React from 'react';

import { useRouter } from 'expo-router';
import { useObservableState } from 'observable-hooks';

import { useIsPhone } from '@wcpos/components/lib/device';
import { cn } from '@wcpos/components/lib/utils';
import { Notice } from '@wcpos/components/notice';
import { Text } from '@wcpos/components/text';
import { useQueryRuntime } from '@wcpos/query';
import { readResidentOrder, refreshOrderRecord } from '@wcpos/query/record-readers';
import {
	observePaymentAttention,
	type PaymentAttentionEntry,
	resolvePaymentAttention,
} from '@wcpos/query/store-local';
import { getLogger } from '@wcpos/utils/logger';

import { useGround } from '../components/ground';
import { useStoreSession } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { useAppInfo } from '../../../hooks/use-app-info';

const logger = getLogger(['wcpos', 'payments']);
const NONE: PaymentAttentionEntry[] = [];
/** The band stays a band: the newest few, then a count, so it never pushes the list off a till. */
const SHOWN = 3;

/**
 * The sales the store refused a payment on (ADR 0040 Decided 1 rule 4: one failed story, in
 * Orders, with the reason). The row under the page bar, in the hold banner's slot and gutter; full
 * width on a phone. It is per cashier, not store-wide: `storeDB` is keyed by the signed-in
 * credential (`generateStoreLocalID` hashes `wpCredentialsID`), so the money journal, the pending
 * completions and these rows all belong to the cashier who took the sale; another cashier signing
 * in does not see them (ADR 0040 Decided 2: the sale stays with its cashier, who is told in the
 * cashier sheet; a cross-cashier view would be its own design). Each
 * entry offers Open order and Handled, and never a Retry: a refused row is never retried on its
 * own, the cashier settles it (a refund, or the balance) and says so.
 */
export function PaymentAttentionNotice() {
	const { storeDB } = useStoreSession();
	const entries = useObservableState(
		React.useMemo(() => observePaymentAttention(storeDB), [storeDB]),
		NONE
	);
	const t = useT();
	const router = useRouter();
	const runtime = useQueryRuntime();
	// The bar stands outside the Pro guard's provider: the guard's own derivation. On Free the
	// pane would open behind the preview blur, so only Handled is offered.
	const readOnly = !useAppInfo().license?.isPro;
	const phone = useIsPhone();
	const ground = useGround();
	if (entries.length === 0) return null;

	// The pane reads the order on this device: one older than the loaded page, or gone after a
	// reset, is demanded from the store first (the targeted refresh a reopen's undo uses).
	const open = async ({ orderUuid, orderId }: PaymentAttentionEntry) => {
		try {
			if (orderId && !(await readResidentOrder(runtime, orderUuid)))
				await refreshOrderRecord(runtime.engine, orderId);
		} catch {
			// Unreachable store: the pane says the order is not on this device, which is true.
		}
		router.setParams({ order: orderUuid });
	};
	const handled = ({ rowId }: PaymentAttentionEntry) =>
		resolvePaymentAttention(storeDB, rowId).catch((error: unknown) =>
			// The row stays: the cashier sees it was not taken.
			logger.warn('Could not mark a refused payment handled', {
				context: {
					paymentId: rowId,
					error: error instanceof Error ? error.message : String(error),
				},
			})
		);
	const hidden = entries.length - SHOWN;

	return (
		<Notice
			tone="bad"
			testID="orders-attention"
			title={t('orders.attention', { count: entries.length })}
			className={cn(!phone && cn(ground.mx, ground.mt))}
			items={entries.slice(0, SHOWN).map((entry) => {
				const handle = {
					label: t('orders.attention_handled'),
					onPress: () => void handled(entry),
					testID: `orders-attention-handled-${entry.rowId}`,
				};
				const openOrder = {
					label: t('orders.attention_open'),
					onPress: () => void open(entry),
					testID: `orders-attention-open-${entry.rowId}`,
				};
				return {
					id: entry.rowId,
					// The refusal's own sentence already names the order, amount and tender.
					text: entry.message,
					actions: readOnly ? ([handle] as const) : ([openOrder, handle] as const),
				};
			})}
		>
			{hidden > 0 && (
				<Text testID="orders-attention-more" className="text-muted-foreground">
					{t('common.and_n_more', { count: hidden })}
				</Text>
			)}
		</Notice>
	);
}
