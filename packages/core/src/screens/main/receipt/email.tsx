import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { isExpectedPreflightBlock } from '@wcpos/hooks/use-http-client/is-expected-preflight-block';
import { DialogBody, DialogFooter } from '@wcpos/components/dialog';
import { Form, FormField, FormInput, FormSwitch } from '@wcpos/components/form';
import { Text } from '@wcpos/components/text';
import { Toast } from '@wcpos/components/toast';
import { VStack } from '@wcpos/components/vstack';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import {
	classifyEmailSendError,
	type EmailSendFailure,
	enqueueReceiptEmail,
} from '@wcpos/query/receipt-email-queue';

import { useT } from '../../../contexts/translations';
import { FormErrors } from '../components/form-errors';
import { useRestHttpClient } from '../hooks/use-rest-http-client';
import { useAppState } from '../../../contexts/app-state';

const httpLogger = getLogger(['wcpos', 'http', 'rest']);
const queueLogger = getLogger(['wcpos', 'receipt', 'emailQueue']);

const formSchema = z.object({
	email: z.string().email(),
	saveEmail: z.boolean(),
});

interface Props {
	order: EngineRecord<'orders'>;
	/** The receipt document's local-only rule: a sale the store has not heard queues as offline. */
	localOnly?: boolean;
}

/**
 * Send a receipt by email — and, when the till cannot reach the server, promise
 * to send it later and keep that promise (#165).
 *
 * The button stays enabled offline. A cashier who taps Send does not want to be
 * told to come back when the wifi is fixed; they want the email to go out. So
 * the tap writes a durable queue row and the drain posts it when the connection
 * returns. The one thing that is never queued is a failure that cannot improve
 * with time — a rejected address earns the same 400 forever, and hiding it
 * behind "queued" would be a lie.
 */
export function EmailForm({ order, localOnly = false }: Props) {
	const http = useRestHttpClient();
	const { storeDB } = useAppState();
	const { status } = useOnlineStatus();
	const [loading, setLoading] = React.useState(false);
	const t = useT();
	const orderData = useRecordField(order, (record) => record.payload);
	const orderID = orderData.id;
	const orderNumber = orderData.number;
	const defaultEmail = orderData.billing?.email ?? '';

	// 'online-website-unavailable' counts as offline here: the device has a
	// network but the store cannot be reached, which fails exactly the same way.
	const isOffline = localOnly || status !== 'online-website-available';

	/**
	 * Persist the send so it survives an app restart, and tell the cashier what
	 * that means. Returns false when there is no queue to write to (no store
	 * database yet), so the caller can fall back to surfacing the error.
	 */
	const queueEmail = React.useCallback(
		async (
			email: string,
			saveEmail: boolean,
			reason: string,
			failure?: EmailSendFailure
		): Promise<boolean> => {
			if (!storeDB || typeof orderID !== 'number') return false;
			try {
				await enqueueReceiptEmail(
					{
						orderId: orderID,
						orderNumber: typeof orderNumber === 'string' ? orderNumber : undefined,
						email,
						saveTo: saveEmail ? 'billing' : '',
						...(failure ? { failure } : {}),
					},
					{ storeDB, logger: queueLogger }
				);
				Toast.show({
					type: 'success',
					text1: t('receipt.email_queued'),
					text2: t('receipt.email_queued_detail'),
				});
				return true;
			} catch (error) {
				// A local database write, not a printing problem.
				queueLogger.error('Failed to queue receipt email', {
					code: ERROR_CODES.LOCAL_DB_WRITE_FAILED,
					context: {
						orderId: orderID,
						email,
						reason,
						error: getErrorMessage(error),
					},
				});
				return false;
			}
		},
		[orderID, orderNumber, storeDB, t]
	);

	/**
	 *
	 */
	const handleSendEmail = React.useCallback(
		async ({ email, saveEmail }: z.infer<typeof formSchema>) => {
			setLoading(true);
			try {
				// Known-offline: skip the round trip that is guaranteed to fail and
				// go straight to the durable promise.
				// A queue write that already failed is reported once; the send below must
				// not try (and report) it a second time.
				let queueFailed = false;
				if (isOffline) {
					if (await queueEmail(email, saveEmail, 'offline')) return;
					queueFailed = true;
				}

				try {
					const { data } = await http.post(`/orders/${orderID}/email`, {
						email,
						save_to: saveEmail ? 'billing' : '',
					});
					if (data && data.success) {
						httpLogger.success(t('receipt.email_sent'), {
							showToast: true,
							context: {
								orderId: orderID,
								email,
							},
						});
						return;
					}
					// A 200 that did not send is a refusal, not a transport failure.
					throw new Error(data?.message || t('receipt.email_not_sent'));
				} catch (error) {
					const failure = classifyEmailSendError(error);
					if (
						failure.kind === 'connectivity' &&
						!queueFailed &&
						(await queueEmail(email, saveEmail, 'send-failed', failure))
					) {
						return;
					}
					const logLevel = isExpectedPreflightBlock(error) ? 'warn' : 'error';
					httpLogger[logLevel]('Failed to send receipt email', {
						showToast: true,
						toast: { text2: failure.reason },
						code: ERROR_CODES.RECEIPT_DELIVERY_FAILED,
						context: {
							blockCode: failure.blockCode,
							orderId: orderID,
							email,
							status: failure.status,
							error: failure.reason,
							serverCode: failure.code,
						},
					});
				}
			} finally {
				setLoading(false);
			}
		},
		[http, isOffline, orderID, queueEmail, t]
	);

	/**
	 *
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema as never) as never,
		defaultValues: {
			email: defaultEmail,
			saveEmail: false,
		},
	});

	/**
	 * Form submission handlers that include validation
	 */
	const sendEmail = form.handleSubmit(handleSendEmail);

	/**
	 *
	 */
	return (
		<>
			<DialogBody className="gap-4">
				<Form {...form}>
					<FormErrors />
					<VStack>
						<FormField
							control={form.control}
							name="email"
							render={({ field }) => <FormInput label={t('receipt.email_address')} {...field} />}
						/>
						<FormField
							control={form.control}
							name="saveEmail"
							render={({ field }) => (
								<FormSwitch label={t('receipt.save_email_to_billing_address')} {...field} />
							)}
						/>
					</VStack>
				</Form>
				{isOffline ? (
					<Text testID="receipt-email-offline-notice" className="text-muted-foreground text-xs">
						{t('receipt.email_offline_notice')}
					</Text>
				) : null}
			</DialogBody>
			<DialogFooter
				close
				intent={{
					label: isOffline ? t('receipt.send_when_online') : t('receipt.send'),
					testID: 'receipt-email-send',
					onPress: () => void sendEmail(),
					loading,
				}}
			/>
		</>
	);
}
