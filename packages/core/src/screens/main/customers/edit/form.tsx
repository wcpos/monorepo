import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { isRxDocument } from 'rxdb';
import * as z from 'zod';

import { useModal } from '@wcpos/components/modal';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../../contexts/translations';
import { CustomerForm, customerFormSchema } from '../../components/customer/customer-form';
import { usePushDocument } from '../../contexts/use-push-document';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCustomerNameFormat } from '../../hooks/use-customer-name-format';

const mutationLogger = getLogger(['wcpos', 'mutations', 'customer']);

interface Props {
	customer: import('@wcpos/database').CustomerDocument;
}

/**
 *
 */
export function EditCustomerForm({ customer }: Props) {
	const t = useT();
	const [loading, setLoading] = React.useState(false);
	const { localPatch } = useLocalMutation();
	const pushDocument = usePushDocument();
	const { format } = useCustomerNameFormat();
	const { close } = useModal();

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
				const patched = await localPatch({
					document: customer,
					data: data as Partial<import('@wcpos/database').CustomerDocument>,
				});
				// localPatch swallows write errors and resolves undefined - pushing
				// anyway would sync the unchanged resident and report success
				if (!patched?.document) {
					throw new Error('Local patch failed');
				}
				await pushDocument(customer).then((savedDoc: unknown) => {
					if (isRxDocument(savedDoc)) {
						mutationLogger.success(
							t('common.saved', {
								name: format(savedDoc as import('@wcpos/database').CustomerDocument),
							}),
							{
								showToast: true,
								context: {
									customerId: (savedDoc as { id?: number }).id,
									customerName: format(savedDoc as import('@wcpos/database').CustomerDocument),
								},
							}
						);
						close();
					}
				});
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				mutationLogger.error('Failed to save customer', {
					showToast: true,
					code: ERROR_CODES.SYNC_UNEXPECTED,
					toast: { title: t('common.failed_to_save_customer') },
					context: {
						customerId: customer.id,
						error: errorMessage,
					},
				});
			} finally {
				setLoading(false);
			}
		},
		[localPatch, customer, pushDocument, t, format, close]
	);

	/**
	 *
	 */
	return <CustomerForm form={form} onClose={close} onSubmit={handleSave} loading={loading} />;
}
