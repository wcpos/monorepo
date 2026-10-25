import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/components/button';
import { useDialog } from '@wcpos/components/dialog';
import { SavedFieldProvider, useFormChangeHandler, useMarkSaved } from '@wcpos/components/form';
import type { CustomerPayload, ReadonlyEngineRecord } from '@wcpos/query';

import { useT } from '../../../../contexts/translations';
import { useAppInfo } from '../../../../hooks/use-app-info';
import { metaForWrite } from '../../components/meta-for-write';
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
	const markSaved = useMarkSaved();
	const writtenMetaKeys = React.useRef(new Set<string>());
	const { flush } = useFormChangeHandler({
		form,
		onChange: async (changes) => {
			if (readOnly) return false;
			const root = Object.keys(changes)[0].split('.')[0] as keyof CustomerFormValues;
			const value = form.getValues(root);
			// The billing identity follows the top-level one while it is empty (ledger line 3): the named
			// setValue is a change the hook sees, so billing writes itself and takes its own mark.
			if (
				(root === 'first_name' || root === 'last_name' || root === 'email') &&
				!form.getValues(`billing.${root}`)
			) {
				form.setValue(`billing.${root}`, value as string);
			}
			const wire =
				root === 'tax_ids' && Array.isArray(value)
					? value.filter((row) => String(row?.value ?? '') !== '')
					: root === 'meta_data' && Array.isArray(value)
						? metaForWrite(
								value,
								customer.getLatest().payload.meta_data ?? [],
								writtenMetaKeys.current
							)
						: value;
			const written = await saveCustomerFields(customer, {
				[root]: wire,
			} as Partial<CustomerPayload>);
			if (written) markSaved([root]);
			return written;
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
