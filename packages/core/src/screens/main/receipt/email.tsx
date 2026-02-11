import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useObservableEagerState } from 'observable-hooks';
import { of } from 'rxjs';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { DialogAction, DialogClose, DialogFooter } from '@wcpos/components/dialog';
import { Form, FormField, FormInput, FormSwitch } from '@wcpos/components/form';
import { VStack } from '@wcpos/components/vstack';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../contexts/translations';
import { FormErrors } from '../components/form-errors';
import { useRestHttpClient } from '../hooks/use-rest-http-client';

const httpLogger = getLogger(['wcpos', 'http', 'rest']);

const formSchema = z.object({
	email: z.string().email(),
	saveEmail: z.boolean(),
});

interface Props {
	order: import('@wcpos/database').OrderDocument;
}

/**
 *
 */
export function EmailForm({ order }: Props) {
	const http = useRestHttpClient();
	const [loading, setLoading] = React.useState(false);
	const t = useT();
	const orderID = useObservableEagerState(order.id$ ?? of(undefined as number | undefined));
	const defaultEmail = order.billing?.email ?? '';

	/**
	 *
	 */
	const handleSendEmail = React.useCallback(
		async ({ email, saveEmail }: z.infer<typeof formSchema>) => {
			try {
				setLoading(true);
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
				}
			} catch (error) {
				httpLogger.error('Failed to send receipt email', {
					showToast: true,
					saveToDb: true,
					context: {
						errorCode: ERROR_CODES.CONNECTION_REFUSED,
						orderId: orderID,
						email,
						error: error instanceof Error ? error.message : String(error),
					},
				});
			} finally {
				setLoading(false);
			}
		},
		[http, orderID, t]
	);

	/**
	 *
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		// @ts-expect-error: zodResolver return type doesn't perfectly match useForm's Resolver generic
		resolver: zodResolver(formSchema),
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
			<DialogFooter className="px-0">
				<DialogClose>{t('common.cancel')}</DialogClose>
				{/* @ts-expect-error: loading prop is forwarded to Button via rest props but not in SlottablePressableProps type */}
				<DialogAction onPress={sendEmail} loading={loading}>
					{t('receipt.send')}
				</DialogAction>
			</DialogFooter>
		</VStack>
	);
}
