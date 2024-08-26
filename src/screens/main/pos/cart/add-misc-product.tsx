import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import isEmpty from 'lodash/isEmpty';
import { useObservableEagerState } from 'observable-hooks';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Form, FormField, FormInput } from '@wcpos/components/src/form';
import { VStack } from '@wcpos/components/src/vstack';

import { useT } from '../../../../contexts/translations';
import NumberInput from '../../components/number-input';
import { TaxClassSelect } from '../../components/tax-class-select';
import { TaxStatusRadioGroup } from '../../components/tax-status-radio-group';
import { useCurrentOrder } from '../contexts/current-order';
import { useAddProduct } from '../hooks/use-add-product';

export interface MiscProductFormValues {
	name?: string;
	price?: string;
	sku?: string;
	tax_status?: string;
	tax_class?: string;
}

export interface AddMiscProductHandle {
	submit: () => void;
}

interface AddMiscProductProps {
	onSubmit: (data: MiscProductFormValues) => void;
}

/**
 *
 */
export const AddMiscProduct = React.forwardRef<AddMiscProductHandle, AddMiscProductProps>(
	({ onSubmit }, ref) => {
		const t = useT();

		/**
		 *
		 */
		const formSchema = React.useMemo(
			() =>
				z.object({
					name: z.string().optional(),
					price: z.string().optional(),
					sku: z.string().optional(),
					tax_status: z.string().optional(),
					tax_class: z.string().optional(),
				}),
			[]
		);

		/**
		 *
		 */
		const form = useForm<z.infer<typeof formSchema>>({
			resolver: zodResolver(formSchema),
			defaultValues: {
				name: '',
				price: '',
				sku: '',
				tax_status: 'taxable',
				tax_class: '',
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
								label={t('Name', { _tags: 'core' })}
								placeholder={t('Product', { _tags: 'core' })}
								{...field}
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="sku"
						render={({ field }) => <FormInput label={t('SKU', { _tags: 'core' })} {...field} />}
					/>
					<FormField
						control={form.control}
						name="price"
						render={({ field }) => (
							<FormInput label={t('Price', { _tags: 'core' })} placeholder="0" {...field} />
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
