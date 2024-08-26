import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Form, FormField, FormInput, FormSwitch } from '@wcpos/components/src/form';
import { VStack } from '@wcpos/components/src/vstack';

import { useT } from '../../../../contexts/translations';
import { AmountWidget } from '../../components/amount-widget';
import { ShippingMethodSelect } from '../../components/shipping-method-select';
import { TaxClassSelect } from '../../components/tax-class-select';
import { TaxStatusRadioGroup } from '../../components/tax-status-radio-group';

export interface ShippingFormValues {
	method_title?: string;
	method_id?: string;
	amount?: number;
	prices_include_tax?: boolean;
	tax_status?: string;
	tax_class?: string;
}

export interface AddShippingHandle {
	submit: () => void;
}

interface AddShippingProps {
	onSubmit: (data: ShippingFormValues) => void;
}

/**
 *
 */
export const AddShipping = React.forwardRef<AddShippingHandle, AddShippingProps>(
	({ onSubmit }, ref) => {
		const t = useT();

		/**
		 *
		 */
		const formSchema = React.useMemo(
			() =>
				z.object({
					method_title: z.string().optional(),
					method_id: z.string().optional(),
					amount: z.number().optional(),
					prices_include_tax: z.boolean().optional(),
					tax_status: z.string().optional(),
					tax_class: z.string().optional(),
				}),
			[]
		);

		/**
		 *
		 */
		React.useImperativeHandle(ref, () => ({
			submit: () => form.handleSubmit(onSubmit)(),
		}));

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
						render={({ field }) => (
							<AmountWidget label={t('Amount', { _tags: 'core' })} {...field} />
						)}
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
	}
);
