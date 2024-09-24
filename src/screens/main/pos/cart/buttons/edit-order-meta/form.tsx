import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Form, FormField, FormInput, useFormChangeHandler } from '@wcpos/components/src/form';
import { VStack } from '@wcpos/components/src/vstack';

import { useT } from '../../../../../../contexts/translations';
import { MetaDataForm, metaDataSchema } from '../../../../components/meta-data-form';

/**
 *
 */
const formSchema = z.object({
	number: z.string().optional(),
	currency: z.string().optional(),
	currency_symbol: z.string().optional(),
	meta_data: metaDataSchema,
});

/**
 *
 */
export const EditOrderMetaForm = ({ order, onChange }) => {
	const t = useT();

	/**
	 *
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			number: order.number,
			currency: order.currency,
			currency_symbol: order.currency_symbol,
			meta_data: order.meta_data,
		},
	});

	/**
	 * Handle form changes and patch UI
	 */
	useFormChangeHandler({ form, onChange });

	/**
	 *
	 */
	return (
		<Form {...form}>
			<VStack>
				<FormField
					control={form.control}
					name="number"
					render={({ field }) => (
						<FormInput label={t('Order Number', { _tags: 'core' })} {...field} />
					)}
				/>
				<FormField
					control={form.control}
					name="currency"
					render={({ field }) => (
						<FormInput label={t('Currency', { _tags: 'core' })} placeholder="0" {...field} />
					)}
				/>
				<FormField
					control={form.control}
					name="currency_symbol"
					render={({ field }) => (
						<FormInput label={t('Currency Symbol', { _tags: 'core' })} placeholder="0" {...field} />
					)}
				/>
				<MetaDataForm />
			</VStack>
		</Form>
	);
};
