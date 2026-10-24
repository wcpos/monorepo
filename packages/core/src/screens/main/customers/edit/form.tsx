import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button } from '@wcpos/components/button';
import { useDialog } from '@wcpos/components/dialog';
import type { CustomerPayload, ReadonlyEngineRecord } from '@wcpos/query';
import { getLogger, isErrorReported } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../../contexts/translations';
import { useAppInfo } from '../../../../hooks/use-app-info';
import { CustomerForm, customerFormSchema } from '../../components/customer/customer-form';
import { reportPushFailure } from '../../contexts/push-failure-code';
import { usePushDocument } from '../../contexts/use-push-document';
import { useCustomerRecord } from '../commands/use-customer-record';
import { DeleteCustomerDialog, useCustomerActions } from '../customer-actions';
import { useCustomerNameFormat } from '../../hooks/use-customer-name-format';

const mutationLogger = getLogger(['wcpos', 'mutations', 'customer']);

interface Props {
	customer: ReadonlyEngineRecord<'customers'>;
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
	// The modal route sits outside the list's ProAccessProvider, so it reads the licence itself.
	const readOnly = !(useAppInfo().license?.isPro ?? false);

	/**
	 *
	 */
	const form = useForm<z.infer<typeof customerFormSchema>>({
		resolver: zodResolver(customerFormSchema as never) as never,
		defaultValues: {
			...customer.toMutableJSON().payload,
		} as z.infer<typeof customerFormSchema>,
	});
	// Sync means "take the store's copy": the landed refresh replaces unsaved edits, so a later
	// Save cannot write the stale defaults back over it.
	const actions = useCustomerActions(customer, {
		onDeleted: close,
		onSynced: () =>
			form.reset({ ...customer.getLatest().payload } as z.infer<typeof customerFormSchema>),
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
				// localPatch reports its own failure (row + toast) and resolves undefined.
				// Pushing anyway would sync the unchanged resident and report success;
				// reporting it again put a second row and toast on one failed save.
				if (!patched) return;
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
		[saveCustomerFields, customer, pushDocument, t, format, close]
	);

	/**
	 *
	 */
	// The record's actions sit left of Close/Save: destructive first (orders #2904).
	const footerLeading =
		!readOnly && (actions.canDelete || actions.canSync) ? (
			<>
				{actions.canDelete && (
					<Button
						variant="outline-destructive"
						testID="customer-modal-delete"
						onPress={actions.requestDelete}
					>
						{t('common.delete')}
					</Button>
				)}
				{actions.canSync && (
					<Button variant="outline" testID="customer-modal-sync" onPress={actions.sync}>
						{t('common.sync')}
					</Button>
				)}
			</>
		) : undefined;

	return (
		<>
			<CustomerForm
				form={form}
				onClose={close}
				onSubmit={handleSave}
				loading={loading}
				footerLeading={footerLeading}
			/>
			{!readOnly && actions.canDelete && (
				<DeleteCustomerDialog
					record={customer}
					open={actions.deleteOpen}
					onOpenChange={actions.setDeleteOpen}
					force={actions.force}
					onForceChange={actions.setForce}
					onConfirm={() => void actions.confirmDelete()}
				/>
			)}
		</>
	);
}
