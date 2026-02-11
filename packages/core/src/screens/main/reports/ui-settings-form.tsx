import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useObservableState } from 'observable-hooks';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Form, useFormChangeHandler } from '@wcpos/components/form';
import { VStack } from '@wcpos/components/vstack';

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
export function UISettingsForm() {
	const { uiSettings, getUILabel, resetUI, patchUI } = useUISettings('reports-orders');
	const formData = useObservableState(uiSettings.$, uiSettings.get());
	const { setButtonPressHandler } = useDialogContext();

	React.useEffect(() => {
		setButtonPressHandler(resetUI);
	}, [setButtonPressHandler, resetUI]);

	/**
	 * Use `values` instead of `defaultValues` + useEffect reset pattern.
	 * This makes the form reactive to external data changes (react-hook-form best practice).
	 */
	const form = useForm<z.infer<typeof schema>>({
		resolver: zodResolver(schema as never) as never,
		values: formData,
	});

	/**
	 * Handle form changes and patch UI
	 */
	useFormChangeHandler({ form: form as never, onChange: patchUI });

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
}
