import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useObservableState } from 'observable-hooks';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Form, useFormChangeHandler } from '@wcpos/components/src/form';
import { VStack } from '@wcpos/components/src/vstack';

import {
	columnsFormSchema,
	UISettingsColumnsForm,
	useDialogContext,
} from '../components/ui-settings';
import { useUISettings } from '../contexts/ui-settings';

export const schema = z.object({
	...columnsFormSchema.shape,
});

/**
 *
 */
export const UISettingsForm = () => {
	const { uiSettings, getUILabel, patchUI, resetUI } = useUISettings('products');
	const formData = useObservableState(uiSettings.$, uiSettings.get());
	const { buttonPressHandlerRef } = useDialogContext();
	buttonPressHandlerRef.current = resetUI;

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
		<Form {...form}>
			<VStack>
				<UISettingsColumnsForm columns={formData.columns} getUILabel={getUILabel} />
			</VStack>
		</Form>
	);
};
