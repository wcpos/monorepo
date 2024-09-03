import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Form, FormField, FormSwitch, FormInput } from '@wcpos/components/src/form';
import { VStack } from '@wcpos/components/src/vstack';

import { useT } from '../../../../../../contexts/translations';
import { MetaDataForm, metaDataSchema } from '../../../../components/meta-data-form';
import { NumberInput } from '../../../../components/number-input';
import { ShippingMethodSelect } from '../../../../components/shipping-method-select';
import { TaxClassSelect } from '../../../../components/tax-class-select';
import { TaxStatusRadioGroup } from '../../../../components/tax-status-radio-group';

/**
 *
 */
const formSchema = z.object({
	method_id: z.string().optional(),
	instance_id: z.string().optional(),
	amount: z.number().optional(),
	prices_include_tax: z.boolean().optional(),
	tax_status: z.string().optional(),
	tax_class: z.string().optional(),
	meta_data: metaDataSchema,
});

/**
 *
 */
export const EditShippingLineForm = () => {
	const t = useT();

	/**
	 *
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {},
	});

	/**
	 *
	 */
	return (
		<Form {...form}>
			<VStack className="gap-4">
				<FormField
					control={form.control}
					name="method_id"
					render={({ field }) => <ShippingMethodSelect field={field} />}
				/>
				<FormField
					control={form.control}
					name="instance_id"
					render={({ field }) => (
						<FormInput label={t('Instance ID', { _tags: 'core' })} {...field} />
					)}
				/>
				<FormField
					control={form.control}
					name="amount"
					render={({ field }) => (
						<FormInput
							customComponent={NumberInput}
							label={t('Amount', { _tags: 'core' })}
							placeholder="0"
							{...field}
						/>
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
					render={({ field }) => (
						<FormRadioGroup
							label={t('Tax Status', { _tags: 'core' })}
							customComponent={TaxStatusRadioGroup}
							{...field}
						/>
					)}
				/>
				<FormField
					control={form.control}
					name="tax_class"
					render={({ field }) => (
						<FormSelect
							label={t('Tax Class', { _tags: 'core' })}
							customComponent={TaxClassSelect}
							{...field}
						/>
					)}
				/>
				<MetaDataForm />
			</VStack>
		</Form>
	);
};
