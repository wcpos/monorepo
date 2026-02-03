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
		resolver: zodResolver(customerFormSchema),
		defaultValues: {
			...customer.toJSON(),
		},
	});

	/**
	 * Save to server
	 *
	 * NOTE: There's an issue if we just patch the form changes, other changes such as customer or if the
	 * order has been reopened will be lost. We need to push the whole order object.
	 */
	const handleSave = React.useCallback(
		async (data) => {
			setLoading(true);
			try {
				await localPatch({
					document: customer,
					data,
				});
				await pushDocument(customer).then((savedDoc) => {
					if (isRxDocument(savedDoc)) {
						mutationLogger.success(t('{name} saved', { name: format(savedDoc) }), {
							showToast: true,
							saveToDb: true,
							context: {
								customerId: savedDoc.id,
								customerName: format(savedDoc),
							},
						});
					}
				});
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				mutationLogger.error(t('Failed to save customer'), {
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
