import * as React from 'react';
import { View } from 'react-native';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { Toast } from '@wcpos/components/toast';
import { VStack } from '@wcpos/components/vstack';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../contexts/translations';
import { useRestHttpClient } from '../hooks/use-rest-http-client';
import {
	drainReceiptEmailQueue,
	receiptEmailPostRequest,
	type ReceiptEmailQueuePort,
	type ReceiptEmailRow,
	removeReceiptEmail,
	retryReceiptEmail,
} from '../receipt/email-queue/queue';
import { useReceiptEmailQueueCollection } from '../receipt/email-queue/use-receipt-email-queue-collection';
import { Callout, Pill } from './components';
import { useNowMs, useRelativeTime } from './use-relative-time';
import { type QueuedEmail, useQueuedEmails } from './use-queued-emails';

const logger = getLogger(['wcpos', 'receipt', 'emailQueue']);

/**
 * Store health → Database · receipt emails that have not gone out yet (#165).
 *
 * The queue drains itself; this panel exists for the two cases it cannot
 * resolve alone — a row the server permanently refused (bad address, missing
 * template) and a row a merchant has decided is no longer wanted. Pending rows
 * are listed too, so "did that receipt ever send?" has an answer that is not a
 * support ticket.
 *
 * The queue is per-device by construction: a row lives in the store database of
 * the till it was queued on, so a second register can neither see nor re-send
 * it. There is no cross-device duplicate to guard against.
 */
export function QueuedEmailsPanel() {
	const t = useT();
	const rows = useQueuedEmails();
	const collection = useReceiptEmailQueueCollection();
	const http = useRestHttpClient();
	const nowMs = useNowMs(30_000);
	const relative = useRelativeTime();
	const [busyId, setBusyId] = React.useState<string | null>(null);

	const post = React.useCallback(
		(row: ReceiptEmailRow) => http.post(...receiptEmailPostRequest(row)),
		[http]
	);

	if (rows.length === 0) return null;

	const failedCount = rows.filter((row) => row.status === 'failed').length;

	const retry = async (row: QueuedEmail) => {
		setBusyId(row.localID);
		try {
			// Refuses a row that is no longer failed, so a stale click cannot pull a
			// just-delivered row back into the pending lane and send it twice.
			const requeued = await retryReceiptEmail(row.doc, logger);
			// Joins the running drain rather than starting a second one, so a retry
			// pressed while the connectivity drain is mid-post cannot double-send.
			if (requeued && collection) {
				await drainReceiptEmailQueue({
					collection: collection as unknown as ReceiptEmailQueuePort,
					post,
					logger,
				});
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error('Receipt email retry failed', {
				code: ERROR_CODES.PRINT_UNEXPECTED,
				context: { localID: row.localID, orderId: row.orderId, error: message },
			});
			Toast.show({
				type: 'error',
				text1: t('health.database.emails.retry_failed'),
				text2: message,
			});
		} finally {
			setBusyId(null);
		}
	};

	const discard = async (row: QueuedEmail) => {
		setBusyId(row.localID);
		try {
			if (!collection) return;
			const removed = await removeReceiptEmail(
				collection as unknown as ReceiptEmailQueuePort,
				row.doc,
				logger
			);
			Toast.show({
				type: removed ? 'success' : 'warning',
				text1: t(
					removed ? 'health.database.emails.removed' : 'health.database.emails.remove_in_flight'
				),
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error('Receipt email removal failed', {
				code: ERROR_CODES.PRINT_UNEXPECTED,
				context: { localID: row.localID, orderId: row.orderId, error: message },
			});
			Toast.show({
				type: 'error',
				text1: t('health.database.emails.remove_failed'),
				text2: message,
			});
		} finally {
			setBusyId(null);
		}
	};

	return (
		<VStack testID="db-queued-emails" className="gap-2">
			<Callout tone={failedCount > 0 ? 'destructive' : 'warning'} testID="db-queued-emails-callout">
				<VStack className="gap-0.5">
					<Text className="text-sm font-semibold">
						{t('health.database.emails.title', { count: rows.length })}
					</Text>
					<Text className="text-muted-foreground text-xs">
						{failedCount > 0
							? t('health.database.emails.body_failed', { count: failedCount })
							: t('health.database.emails.body_pending')}
					</Text>
				</VStack>
			</Callout>

			<VStack className="gap-0">
				{rows.map((row) => (
					<HStack
						key={row.localID}
						testID={`db-queued-email-row-${row.localID}`}
						className="border-border flex-wrap items-center gap-2 border-b py-2"
					>
						<View className="min-w-0 flex-1">
							<HStack className="items-center gap-2">
								<Text className="font-medium">{describeRow(row, t)}</Text>
								{row.status === 'failed' ? (
									<Pill tone="destructive" testID={`db-queued-email-failed-${row.localID}`}>
										{t('health.database.emails.failed')}
									</Pill>
								) : (
									<Pill tone="warning" testID={`db-queued-email-pending-${row.localID}`}>
										{t('health.database.emails.pending')}
									</Pill>
								)}
							</HStack>
							<Text className="text-muted-foreground text-xs">
								{t('health.database.emails.when', {
									ago: relative(Date.parse(row.queuedAt), nowMs),
								})}
								{row.attempts > 0
									? ` · ${t('health.database.emails.tries', { count: row.attempts })}`
									: ''}
							</Text>
							{row.lastError ? (
								<Text className="text-muted-foreground/80 text-xs">{row.lastError}</Text>
							) : null}
						</View>
						<HStack className="items-center gap-2">
							{/* Only a refused row gets Send again. A pending row is already
							    going to be retried on its own schedule, and offering the
							    button there would only invite a click that races the drain. */}
							{row.status === 'failed' ? (
								<Button
									variant="outline"
									size="sm"
									testID={`db-queued-email-retry-${row.localID}`}
									disabled={busyId !== null}
									onPress={() => void retry(row)}
								>
									<ButtonText>{t('health.database.emails.retry')}</ButtonText>
								</Button>
							) : null}
							<Button
								variant="ghost"
								size="sm"
								testID={`db-queued-email-remove-${row.localID}`}
								disabled={busyId !== null}
								onPress={() => void discard(row)}
							>
								<ButtonText className="text-destructive">
									{t('health.database.emails.remove')}
								</ButtonText>
							</Button>
						</HStack>
					</HStack>
				))}
			</VStack>
		</VStack>
	);
}

type Translate = ReturnType<typeof useT>;

/** "customer@example.com · #1042" — the address first, because that is what a merchant is checking. */
function describeRow(row: QueuedEmail, t: Translate): string {
	const order = row.orderNumber
		? `#${row.orderNumber}`
		: t('health.database.emails.order', { id: row.orderId });
	return `${row.email} · ${order}`;
}
