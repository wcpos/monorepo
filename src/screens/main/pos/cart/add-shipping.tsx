import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import isEmpty from 'lodash/isEmpty';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Form, FormField, FormInput, FormSwitch } from '@wcpos/components/src/form';
import { VStack } from '@wcpos/components/src/vstack';

import { useDialogContext } from './add-cart-item-button';
import { useT } from '../../../../contexts/translations';
import { AmountWidget } from '../../components/amount-widget';
import { ShippingMethodSelect } from '../../components/shipping-method-select';
import { TaxClassSelect } from '../../components/tax-class-select';
import { TaxStatusRadioGroup } from '../../components/tax-status-radio-group';
import { useAddShipping } from '../hooks/use-add-shipping';

const formSchema = z.object({
	method_title: z.string().optional(),
	method_id: z.string().optional(),
	amount: z.number().optional(),
	prices_include_tax: z.boolean().optional(),
	tax_status: z.string().optional(),
	tax_class: z.string().optional(),
});

/**
 *
 */
export const AddShipping = () => {
	const t = useT();
	const { buttonPressHandlerRef, setOpenDialog } = useDialogContext();
	const { addShipping } = useAddShipping();

	/**
	 *
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			method_title: '',
			method_id: '',
			amount: 0,
			prices_include_tax: true,
			tax_status: 'taxable',
			tax_class: 'standard',
		},
	});

	/**
	 *
	 */
	buttonPressHandlerRef.current = React.useCallback(() => {
		const { method_title, method_id, amount, tax_status, tax_class, prices_include_tax } =
			form.getValues();

		addShipping({
			method_title: isEmpty(method_title) ? t('Shipping', { _tags: 'core' }) : method_title,
			method_id: isEmpty(method_id) ? 'local_pickup' : method_id,
			amount: isEmpty(amount) ? '0' : amount,
			tax_status,
			tax_class,
			prices_include_tax,
		});
		setOpenDialog(false);
	}, [addShipping, form, setOpenDialog, t]);

	/**
	 *
	 */
	return (
		<Form {...form}>
			<VStack>
				<FormField
					control={form.control}
					name="method_title"
					render={({ field }) => (
						<FormInput
							label={t('Shipping Method Title', { _tags: 'core' })}
							placeholder={t('Shipping', { _tags: 'core' })}
							{...field}
						/>
					)}
				/>
				<FormField
					control={form.control}
					name="method_id"
					render={({ field }) => <ShippingMethodSelect field={field} />}
				/>
				<FormField
					control={form.control}
					name="amount"
					render={({ field }) => <AmountWidget label={t('Amount', { _tags: 'core' })} {...field} />}
				/>
				<FormField
					control={form.control}
					name="prices_include_tax"
					render={({ field }) => (
						<FormSwitch
							label={t('Amount Includes Tax', { _tags: 'core' })}
							description="Description"
							{...field}
						/>
					)}
				/>
				<FormField
					control={form.control}
					name="tax_status"
					render={({ field }) => <TaxStatusRadioGroup form={form} field={field} />}
				/>
				<FormField
					control={form.control}
					name="tax_class"
					render={({ field }) => <TaxClassSelect field={field} />}
				/>
			</VStack>
		</Form>
	);
};
