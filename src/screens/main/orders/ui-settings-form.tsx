import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useObservableState } from 'observable-hooks';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Form } from '@wcpos/tailwind/src/form';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { useT } from '../../../contexts/translations';
import { columnsFormSchema, UISettingsColumnsForm } from '../components/ui-settings';
import { useUISettings } from '../contexts/ui-settings';

export const schema = z.object({
	...columnsFormSchema.shape,
});

/**
 *
 */
export const UISettingsForm = () => {
	const { uiSettings, getUILabel } = useUISettings('orders');
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
				<UISettingsColumnsForm form={form} columns={formData.columns} getUILabel={getUILabel} />
			</VStack>
		</Form>
	);
};
