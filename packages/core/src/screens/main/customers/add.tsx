import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@wcpos/components/dialog';
import { Text } from '@wcpos/components/text';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../contexts/translations';
import { CustomerForm, customerFormSchema } from '../components/customer/customer-form';
import { useCustomerRecord } from './commands/use-customer-record';
import { useCustomerNameFormat } from '../hooks/use-customer-name-format';

const mutationLogger = getLogger(['wcpos', 'mutations', 'customer']);

/**
 *
 */
export function AddCustomerScreen() {
	const { createCustomer } = useCustomerRecord();
	const t = useT();
	const [loading, setLoading] = React.useState(false);
	const router = useRouter();
	const { format } = useCustomerNameFormat();

	/**
	 *
	 */
	const form = useForm<z.infer<typeof customerFormSchema>>({
		resolver: zodResolver(customerFormSchema as never) as never,
		defaultValues: {},
	});

	/**
	 * Save to server
	 */
	const handleSave = React.useCallback(
		async (data: z.infer<typeof customerFormSchema>) => {
			setLoading(true);
			try {
				// create() logs and toasts its own failure; reporting it here too doubled it.
				const savedDoc = await createCustomer(data);
				if (savedDoc) {
					// create() returns the raw engine record — the customer body is its payload.
					const saved = savedDoc.getLatest().payload;
					mutationLogger.success(t('common.saved', { name: format(saved) }), {
						showToast: true,
						context: {
							customerId: saved?.id,
							customerName: format(saved),
						},
					});
					router.back();
				}
			} catch (error) {
				const errorMessage = getErrorMessage(error);
				mutationLogger.error('Failed to save customer', {
					showToast: true,
					code: ERROR_CODES.SYNC_UNEXPECTED,
					toast: { title: t('common.failed_to_save_customer') },
					context: {
						error: errorMessage,
					},
				});
			} finally {
				setLoading(false);
			}
		},
		[createCustomer, format, router, t]
	);

	/**
	 *
	 */
	return (
		<Dialog route>
			<DialogContent side="right" size="xl">
				<DialogHeader>
					<DialogTitle>
						<Text>{t('customers.add_customer')}</Text>
					</DialogTitle>
				</DialogHeader>
				<ErrorBoundary>
					<CustomerForm
						form={form}
						onSubmit={handleSave}
						onClose={() => router.back()}
						loading={loading}
					/>
				</ErrorBoundary>
			</DialogContent>
		</Dialog>
	);
}
