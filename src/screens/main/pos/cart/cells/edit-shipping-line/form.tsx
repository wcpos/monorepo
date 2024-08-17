import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Form, FormField, FormSwitch, FormInput } from '@wcpos/tailwind/src/form';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { useT } from '../../../../../../contexts/translations';
import { MetaDataForm, metaDataSchema } from '../../../../components/meta-data-form';
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
			<VStack>
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
				<MetaDataForm />
			</VStack>
		</Form>
	);
};
