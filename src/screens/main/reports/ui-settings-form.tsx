import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useObservableState } from 'observable-hooks';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Form, useFormChangeHandler } from '@wcpos/components/src/form';
import { VStack } from '@wcpos/components/src/vstack';

import { useT } from '../../../contexts/translations';
import {
	columnsFormSchema,
	UISettingsColumnsForm,
	ResetUISettingsButton,
} from '../components/ui-settings';
import { useUISettings } from '../contexts/ui-settings';

export const schema = z.object({
	...columnsFormSchema.shape,
});

/**
 *
 */
export const UISettingsForm = () => {
	const { uiSettings, getUILabel, resetUI, patchUI } = useUISettings('reports-orders');
	const formData = useObservableState(uiSettings.$, uiSettings.get());

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
	 * Track formData changes and reset form
	 */
	React.useEffect(() => {
		form.reset({ ...formData });
	}, [formData, form]);

	/**
	 * Handle form changes and patch UI
	 */
	useFormChangeHandler({ form, onChange: patchUI });

	/**
	 *
	 */
	return (
		<VStack space="lg">
			<Form {...form}>
				<VStack>
					<UISettingsColumnsForm form={form} columns={formData.columns} getUILabel={getUILabel} />
				</VStack>
			</Form>
			<ResetUISettingsButton onPress={resetUI} />
		</VStack>
	);
};
