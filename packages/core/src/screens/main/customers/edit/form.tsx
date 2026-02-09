import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { isRxDocument } from 'rxdb';
import * as z from 'zod';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../../contexts/translations';
import { CustomerForm, customerFormSchema } from '../../components/customer/customer-form';
import usePushDocument from '../../contexts/use-push-document';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import useCustomerNameFormat from '../../hooks/use-customer-name-format';

const mutationLogger = getLogger(['wcpos', 'mutations', 'customer']);

interface Props {
	customer: import('@wcpos/database').CustomerDocument;
}

/**
 *
 */
export const EditCustomerForm = ({ customer }: Props) => {
	const t = useT();
	const [loading, setLoading] = React.useState(false);
	const { localPatch } = useLocalMutation();
	const pushDocument = usePushDocument();
	const { format } = useCustomerNameFormat();
	const router = useRouter();

	/**
	 *
	 */
	const form = useForm<z.infer<typeof customerFormSchema>>({
		resolver: zodResolver(customerFormSchema as never) as never,
		defaultValues: {
			...(customer.toJSON() as Record<string, unknown>),
		} as z.infer<typeof customerFormSchema>,
	});

	/**
	 * Save to server
	 *
	 * NOTE: There's an issue if we just patch the form changes, other changes such as customer or if the
	 * order has been reopened will be lost. We need to push the whole order object.
	 */
	const handleSave = React.useCallback(
		async (data: z.infer<typeof customerFormSchema>) => {
			setLoading(true);
			try {
				await localPatch({
					document: customer,
					data: data as Partial<import('@wcpos/database').CustomerDocument>,
				});
				await pushDocument(customer).then((savedDoc: unknown) => {
					if (isRxDocument(savedDoc)) {
						mutationLogger.success(
							t('common.saved', {
								name: format(savedDoc as import('@wcpos/database').CustomerDocument),
							}),
							{
								showToast: true,
								saveToDb: true,
								context: {
									customerId: (savedDoc as { id?: number }).id,
									customerName: format(savedDoc as import('@wcpos/database').CustomerDocument),
								},
							}
						);
					}
				});
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				mutationLogger.error(t('common.failed_to_save_customer'), {
					showToast: true,
					saveToDb: true,
					context: {
						errorCode: ERROR_CODES.TRANSACTION_FAILED,
						customerId: customer.id,
						error: errorMessage,
					},
				});
			} finally {
				setLoading(false);
			}
		},
		[localPatch, customer, pushDocument, t, format]
	);

	/**
	 *
	 */
	return (
		<CustomerForm
			form={form}
			onClose={() => router.back()}
			onSubmit={handleSave}
			loading={loading}
		/>
	);
};
