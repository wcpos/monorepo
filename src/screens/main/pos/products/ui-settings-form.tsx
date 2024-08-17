import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useObservableState } from 'observable-hooks';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Form, FormField, FormSwitch, FormInput } from '@wcpos/tailwind/src/form';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { useT } from '../../../../contexts/translations';
import { columnsFormSchema, UISettingsColumnsForm } from '../../components/ui-settings';
import { useUISettings } from '../../contexts/ui-settings';

export const schema = z.object({
	showOutOfStock: z.boolean(),
	...columnsFormSchema.shape,
	metaDataKeys: z.string().optional(),
});

/**
 *
 */
export const UISettingsForm = () => {
	const { uiSettings, getUILabel } = useUISettings('pos-products');
	const formData = useObservableState(uiSettings.$, uiSettings.get());
	const t = useT();

	/**
	 *
	 */
	const form = useForm<z.infer<typeof schema>>({
		resolver: zodResolver(schema),
		defaultValues: {
			...formData,
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
					name="showOutOfStock"
					render={({ field }) => <FormSwitch label={getUILabel('showOutOfStock')} {...field} />}
				/>
				<UISettingsColumnsForm form={form} columns={formData.columns} getUILabel={getUILabel} />
				<FormField
					control={form.control}
					name="metaDataKeys"
					render={({ field }) => (
						<FormInput
							label={getUILabel('metaDataKeys')}
							description={t('A list of product meta keys that should be copied to the cart', {
								_tags: 'core',
							})}
							{...field}
						/>
					)}
				/>
			</VStack>
		</Form>
	);
};
