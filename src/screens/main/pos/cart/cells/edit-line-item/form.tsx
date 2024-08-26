import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Form, FormField, FormInput } from '@wcpos/components/src/form';
import { VStack } from '@wcpos/components/src/vstack';

import { useT } from '../../../../../../contexts/translations';
import { MetaDataForm, metaDataSchema } from '../../../../components/meta-data-form';
import { TaxClassSelect } from '../../../../components/tax-class-select';
import { TaxStatusRadioGroup } from '../../../../components/tax-status-radio-group';

/**
 *
 */
const formSchema = z.object({
	sku: z.string().optional(),
	price: z.string().optional(),
	regular_price: z.string().optional(),
	tax_status: z.string().optional(),
	tax_class: z.string().optional(),
	meta_data: metaDataSchema,
});

/**
 *
 */
export const EditLineItemForm = () => {
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
					name="regular_price"
					render={({ field }) => (
						<FormInput label={t('Regular Price', { _tags: 'core' })} placeholder="0" {...field} />
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
