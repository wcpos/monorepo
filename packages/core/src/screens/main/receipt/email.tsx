import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useObservableEagerState } from 'observable-hooks';
import { of } from 'rxjs';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { DialogAction, DialogClose, DialogFooter } from '@wcpos/components/dialog';
import { Form, FormField, FormInput, FormSwitch } from '@wcpos/components/form';
import { Text } from '@wcpos/components/text';
import { Toast } from '@wcpos/components/toast';
import { VStack } from '@wcpos/components/vstack';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../contexts/translations';
import { FormErrors } from '../components/form-errors';
import { useRestHttpClient } from '../hooks/use-rest-http-client';
import { classifyEmailSendError, type EmailSendFailure } from './email-queue/classify';
import { enqueueReceiptEmail, type ReceiptEmailQueuePort } from './email-queue/queue';
import { useReceiptEmailQueueCollection } from './email-queue/use-receipt-email-queue-collection';

const httpLogger = getLogger(['wcpos', 'http', 'rest']);
const queueLogger = getLogger(['wcpos', 'receipt', 'emailQueue']);

const formSchema = z.object({
	email: z.string().email(),
	saveEmail: z.boolean(),
});

interface Props {
	order: import('@wcpos/database').OrderDocument;
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
export function EmailForm({ order }: Props) {
	const http = useRestHttpClient();
	const queueCollection = useReceiptEmailQueueCollection();
	const { status } = useOnlineStatus();
	const [loading, setLoading] = React.useState(false);
	const t = useT();
	const orderID = useObservableEagerState(order.id$ ?? of(undefined as number | undefined));
	const orderNumber = useObservableEagerState(order.number$ ?? of(undefined as string | undefined));
	const defaultEmail = order.billing?.email ?? '';

	// 'online-website-unavailable' counts as offline here: the device has a
	// network but the store cannot be reached, which fails exactly the same way.
	const isOffline = status !== 'online-website-available';
	const queue = queueCollection as unknown as ReceiptEmailQueuePort | undefined;

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
			if (!queue || typeof orderID !== 'number') return false;
			try {
				await enqueueReceiptEmail(
					{ collection: queue, logger: queueLogger },
					{
						orderId: orderID,
						orderNumber: typeof orderNumber === 'string' ? orderNumber : undefined,
						email,
						saveTo: saveEmail ? 'billing' : '',
						...(failure ? { failure } : {}),
					}
				);
				Toast.show({
					type: 'success',
					text1: t('receipt.email_queued'),
					text2: t('receipt.email_queued_detail'),
				});
				return true;
			} catch (error) {
				queueLogger.error('Failed to queue receipt email', {
					context: {
						orderId: orderID,
						email,
						reason,
						error: error instanceof Error ? error.message : String(error),
					},
				});
				return false;
			}
		},
		[orderID, orderNumber, queue, t]
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
				if (isOffline && (await queueEmail(email, saveEmail, 'offline'))) {
					return;
				}

				try {
					const { data } = await http.post(`/orders/${orderID}/email`, {
						email,
						save_to: saveEmail ? 'billing' : '',
					});
					if (data && data.success) {
						httpLogger.success(t('receipt.email_sent'), {
							showToast: true,
							saveToDb: true,
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
						(await queueEmail(email, saveEmail, 'send-failed', failure))
					) {
						return;
					}
					httpLogger.error('Failed to send receipt email', {
						showToast: true,
						saveToDb: true,
						toast: { text2: failure.reason },
						context: {
							errorCode: failure.code ?? ERROR_CODES.RECEIPT_DELIVERY_FAILED,
							blockCode: failure.blockCode,
							orderId: orderID,
							email,
							status: failure.status,
							error: failure.reason,
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
		<VStack className="gap-4">
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
			<DialogFooter className="px-0">
				<DialogClose>{t('common.cancel')}</DialogClose>
				{/* @ts-expect-error: loading prop is forwarded to Button via rest props but not in SlottablePressableProps type */}
				<DialogAction testID="receipt-email-send" onPress={sendEmail} loading={loading}>
					{isOffline ? t('receipt.send_when_online') : t('receipt.send')}
				</DialogAction>
			</DialogFooter>
		</VStack>
	);
}
