import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Form, FormField, FormInput, FormSwitch } from '@wcpos/components/src/form';
import { VStack } from '@wcpos/components/src/vstack';

import { useT } from '../../../../contexts/translations';
import { AmountWidget, amountWidgetSchema } from '../../components/amount-widget';
import { TaxClassSelect } from '../../components/tax-class-select';
import { TaxStatusRadioGroup } from '../../components/tax-status-radio-group';

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

export interface FeeFormValues {
	name?: string;
	amount?: number;
	prices_include_tax?: boolean;
	tax_status?: string;
	tax_class?: string;
}

export interface AddFeeHandle {
	submit: () => void;
}

interface AddFeeProps {
	onSubmit: (data: FeeFormValues) => void;
}

/**
 *
 */
export const AddFee = React.forwardRef<AddFeeHandle, AddFeeProps>(({ onSubmit }, ref) => {
	const t = useT();

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
	React.useImperativeHandle(ref, () => ({
		submit: () => form.handleSubmit(onSubmit)(),
	}));

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
});
