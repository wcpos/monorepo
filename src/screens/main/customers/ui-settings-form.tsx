import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useObservableState } from 'observable-hooks';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { Form } from '@wcpos/tailwind/src/form';
import { HStack } from '@wcpos/tailwind/src/hstack';
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
	const { uiSettings, getUILabel, resetUI, patchUI } = useUISettings('customers');
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
	 * Track formData changes and reset form
	 */
	React.useEffect(() => {
		form.reset({ ...formData });
	}, [formData, form]);

	/**
	 * Handle form changes and patch UI
	 */
	React.useEffect(() => {
		// Ignore the first render after formData changes
		const subscription = form.watch((values) => {
			const changes = {};

			Object.keys(values).forEach((key) => {
				if (JSON.stringify(values[key]) !== JSON.stringify(formData[key])) {
					changes[key] = values[key];
				}
			});

			if (Object.keys(changes).length > 0) {
				patchUI(changes);
			}
		});

		return () => subscription.unsubscribe();
	}, [formData, patchUI, form]);

	/**
	 *
	 */
	return (
		<Form {...form}>
			<VStack>
				<UISettingsColumnsForm form={form} columns={formData.columns} getUILabel={getUILabel} />
			</VStack>
			<HStack>
				<Button variant="destructive" onPress={resetUI}>
					<ButtonText>{t('Restore Default Settings', { _tags: 'core' })}</ButtonText>
				</Button>
			</HStack>
		</Form>
	);
};
