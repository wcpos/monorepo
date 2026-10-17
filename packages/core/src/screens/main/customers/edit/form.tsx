import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { useModal } from '@wcpos/components/modal';
import type { EngineRecord } from '@wcpos/query';
import { getLogger, isErrorReported } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../../contexts/translations';
import { CustomerForm, customerFormSchema } from '../../components/customer/customer-form';
import { reportPushFailure } from '../../contexts/push-failure-code';
import { usePushDocument } from '../../contexts/use-push-document';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
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
				const patched = await localPatch({
					document: customer,
					data: data as Partial<import('@wcpos/database').CustomerDocument>,
				});
				// localPatch reports its own failure (row + toast) and resolves undefined.
				// Pushing anyway would sync the unchanged resident and report success;
				// reporting it again put a second row and toast on one failed save.
				if (!patched?.document) return;
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
				// A localPatch rethrow (the scope moved twice) is already reported.
				if (isErrorReported(error)) return;
				// The customer push only enqueues (it does not await the store), so what
				// fails here is the local write, not a store refusal: SYNC101, not SYNC999.
				reportPushFailure(mutationLogger, 'Failed to save customer', error, {
					fallback: ERROR_CODES.LOCAL_DB_WRITE_FAILED,
					title: t('common.failed_to_save_customer'),
					context: { customerId: customer.getLatest().payload.id },
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
