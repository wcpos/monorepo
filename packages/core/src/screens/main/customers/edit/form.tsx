import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { useDialog } from '@wcpos/components/dialog';
import type { CustomerPayload, EngineRecord } from '@wcpos/query';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';

import { useT } from '../../../../contexts/translations';
import { CustomerForm, customerFormSchema } from '../../components/customer/customer-form';
import { pushFailureCode } from '../../contexts/push-failure-code';
import { usePushDocument } from '../../contexts/use-push-document';
import { useCustomerRecord } from '../commands/use-customer-record';
import { useCustomerNameFormat } from '../../hooks/use-customer-name-format';

const mutationLogger = getLogger(['wcpos', 'mutations', 'customer']);

interface Props {
	customer: EngineRecord<'customers'>;
}

/**
 *
 */
export function EditCustomerForm({ customer }: Props) {
	const t = useT();
	const [loading, setLoading] = React.useState(false);
	const { saveCustomerFields } = useCustomerRecord();
	const pushDocument = usePushDocument();
	const { format } = useCustomerNameFormat();
	const { close } = useDialog();

	/**
	 *
	 */
	const form = useForm<z.infer<typeof customerFormSchema>>({
		resolver: zodResolver(customerFormSchema as never) as never,
		defaultValues: {
			...customer.toMutableJSON().payload,
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
				const patched = await saveCustomerFields(customer, data as Partial<CustomerPayload>);
				// localPatch swallows write errors and resolves undefined - pushing
				// anyway would sync the unchanged resident and report success
				if (!patched) {
					throw new Error('Local patch failed');
				}
				await pushDocument(customer).then((savedDoc: unknown) => {
					if (savedDoc) {
						const saved = customer.getLatest().payload;
						mutationLogger.success(
							t('common.saved', {
								name: format(saved),
							}),
							{
								showToast: true,
								context: {
									customerId: saved.id,
									customerName: format(saved),
								},
							}
						);
						close();
					}
				});
			} catch (error) {
				const errorMessage = getErrorMessage(error);
				mutationLogger.error('Failed to save customer', {
					showToast: true,
					code: pushFailureCode(error),
					toast: { title: t('common.failed_to_save_customer') },
					context: {
						customerId: customer.getLatest().payload.id,
						error: errorMessage,
					},
				});
			} finally {
				setLoading(false);
			}
		},
		[saveCustomerFields, customer, pushDocument, t, format, close]
	);

	/**
	 *
	 */
	return <CustomerForm form={form} onClose={close} onSubmit={handleSave} loading={loading} />;
}
