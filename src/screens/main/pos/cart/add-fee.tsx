import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import isEmpty from 'lodash/isEmpty';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Form, FormField, FormInput, FormSwitch } from '@wcpos/components/src/form';
import { VStack } from '@wcpos/components/src/vstack';

import { useDialogContext } from './add-cart-item-button';
import { useT } from '../../../../contexts/translations';
import { AmountWidget, amountWidgetSchema } from '../../components/amount-widget';
import { TaxClassSelect } from '../../components/tax-class-select';
import { TaxStatusRadioGroup } from '../../components/tax-status-radio-group';
import { useAddFee } from '../hooks/use-add-fee';

/**
 *
 */
const formSchema = z.object({
	name: z.string().optional(),
	prices_include_tax: z.boolean().optional(),
	tax_status: z.string().optional(),
	tax_class: z.string().optional(),
	...amountWidgetSchema.shape,
});

/**
 *
 */
export const AddFee = () => {
	const t = useT();
	const { buttonPressHandlerRef, setOpenDialog } = useDialogContext();
	const { addFee } = useAddFee();

	/**
	 *
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: '',
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
		const {
			name,
			amount,
			percent,
			tax_status,
			tax_class,
			prices_include_tax,
			percent_of_cart_total_with_tax,
		} = form.getValues();
		addFee({
			name: isEmpty(name) ? t('Fee', { _tags: 'core' }) : name,
			// total: isEmpty(total) ? '0' : total,
			amount,
			tax_status,
			tax_class,
			percent,
			prices_include_tax,
			percent_of_cart_total_with_tax,
		});
		setOpenDialog(false);
	}, [addFee, form, setOpenDialog, t]);

	/**
	 *
	 */
	return (
		<Form {...form}>
			<VStack>
				<FormField
					control={form.control}
					name="name"
					render={({ field }) => (
						<FormInput
							label={t('Fee Name', { _tags: 'core' })}
							placeholder={t('Fee', { _tags: 'core' })}
							{...field}
						/>
					)}
				/>
				<FormField
					control={form.control}
					name="amount"
					// render={({ field }) => <AmountWidget label={t('Amount', { _tags: 'core' })} {...field} />}
					render={() => (
						<AmountWidget nameAmount="amount" namePercent="percent" currencySymbol="$" />
					)}
				/>
				<FormField
					control={form.control}
					name="prices_include_tax"
					render={({ field }) => (
						<FormSwitch label={t('Amount Includes Tax', { _tags: 'core' })} {...field} />
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
