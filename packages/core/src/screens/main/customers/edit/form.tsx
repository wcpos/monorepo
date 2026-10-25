import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/components/button';
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
	// patch, so a close or a Sync cannot drop it. `mirrors` carries each identity write's capture to
	// its own `after`, keyed by root: writes overlap, and a password save must not evict a name's.
	type Identity = 'first_name' | 'last_name' | 'email';
	const mirrors = React.useRef(new Map<Identity, { was: string; value: string }>());
	const { flush } = useRecordAutosave({
		form,
		readOnly,
		stored: () => customer.getLatest().payload,
		save: (patch) => saveCustomerFields(customer, patch),
		patch: async (root, value) => {
			const identity = root === 'first_name' || root === 'last_name' || root === 'email';
			const mirrored = identity ? String(form.getValues(`billing.${root}`) ?? '') : null;
			const follows =
				identity &&
				(mirrored === '' || mirrored === String(customer.getLatest().payload[root] ?? ''));
			if (!follows) return { [root]: value } as Partial<CustomerPayload>;
			mirrors.current.set(root as Identity, { was: mirrored as string, value: value as string });
			// The mirror rides on the billing draft only while that draft is valid; otherwise on the
			// stored billing, so an invalid email left in the draft never enters by the side door.
			const base = (await form.trigger('billing'))
				? form.getValues('billing')
				: customer.getLatest().payload.billing;
			return { [root]: value, billing: { ...base, [root]: value } } as Partial<CustomerPayload>;
		},
		after: (root, written) => {
			const captured = mirrors.current.get(root as Identity);
			if (!captured) return;
			mirrors.current.delete(root as Identity);
			if (!written) return;
			// Level the draft only if the cashier has not typed into the billing field meanwhile.
			if (String(form.getValues(`billing.${root as Identity}`) ?? '') === captured.was) {
				form.setValue(`billing.${root as Identity}`, captured.value);
			}
		},
	});
	// Sync flushes pending edits before taking the store's copy.
	const actions = useCustomerActions(customer, {
		onDeleted: close,
		beforeSync: flush,
		onSynced: () =>
			form.reset({ ...customer.getLatest().payload } as z.infer<typeof customerFormSchema>),
	});

	/**
	 *
	 */
	// The record's actions sit left of Close: destructive first (orders #2904).
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
				footer={
					<Button testID="customer-form-close" variant="outline" onPress={close}>
						<ButtonText>{t('common.close')}</ButtonText>
					</Button>
				}
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
