import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { useDialog } from '@wcpos/components/dialog';
import { SavedFieldProvider } from '@wcpos/components/form';
import type { CustomerPayload, ReadonlyEngineRecord } from '@wcpos/query';

import { useT } from '../../../../contexts/translations';
import { useAppInfo } from '../../../../hooks/use-app-info';
import { useRecordAutosave } from '../../components/use-record-autosave';
import {
	CustomerForm,
	customerFormSchema,
	type CustomerFormValues,
} from '../../components/customer/customer-form';
import { useCustomerRecord } from '../commands/use-customer-record';
import { DeleteCustomerDialog, useCustomerActions } from '../customer-actions';

interface Props {
	customer: ReadonlyEngineRecord<'customers'>;
}

/**
 *
 */
export function EditCustomerForm(props: Props) {
	return (
		<SavedFieldProvider>
			<EditCustomerFormFields {...props} />
		</SavedFieldProvider>
	);
}

function EditCustomerFormFields({ customer }: Props) {
	const t = useT();
	const { saveCustomerFields } = useCustomerRecord();
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
	// The billing identity follows the top-level one (ledger line 9) while it is empty OR still equal
	// to the value the record held before the write: an autosave writes on every pause, so "fill when
	// empty" alone would pin the first partial word ("Jo") into billing for good. It rides in the SAME
	// patch, so a close or a Sync cannot drop it. Writes overlap (even two of one root), so each
	// write's capture lives in its own `after` closure, never in a shared slot.
	type Identity = 'first_name' | 'last_name' | 'email';
	const { flush } = useRecordAutosave({
		form,
		readOnly,
		stored: () => customer.getLatest().payload,
		persist: (data) => saveCustomerFields(customer, data),
		compose: async (root, value) => {
			const identity = root === 'first_name' || root === 'last_name' || root === 'email';
			const mirrored = identity ? String(form.getValues(`billing.${root}`) ?? '') : null;
			const follows =
				identity &&
				(mirrored === '' || mirrored === String(customer.getLatest().payload[root] ?? ''));
			if (!follows) return { [root]: value } as Partial<CustomerPayload>;
			const key = root as Identity;
			const was = mirrored as string;
			// The mirror rides on the billing draft only while that draft is valid; otherwise on the
			// stored billing, so an invalid email left in the draft never enters by the side door.
			const base = (await form.trigger('billing'))
				? form.getValues('billing')
				: customer.getLatest().payload.billing;
			return {
				data: { [root]: value, billing: { ...base, [root]: value } } as Partial<CustomerPayload>,
				after: (written: boolean) => {
					// Level the draft only if the cashier has not typed into the billing field meanwhile.
					if (written && String(form.getValues(`billing.${key}`) ?? '') === was) {
						form.setValue(`billing.${key}`, value as string);
					}
				},
			};
		},
	});
	// Sync flushes pending edits before taking the store's copy.
	const actions = useCustomerActions(customer, {
		onDeleted: close,
		beforeSync: flush,
		onSynced: () =>
			form.reset({ ...customer.getLatest().payload } as z.infer<typeof customerFormSchema>),
	});

	return (
		<>
			<CustomerForm
				form={form}
				footer={{
					destructive: !readOnly &&
						actions.canDelete && {
							label: t('common.delete'),
							testID: 'customer-modal-delete',
							onPress: actions.requestDelete,
						},
					record: !readOnly &&
						actions.canSync && {
							label: t('common.sync'),
							testID: 'customer-modal-sync',
							onPress: actions.sync,
						},
					close: { testID: 'customer-form-close' },
				}}
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
