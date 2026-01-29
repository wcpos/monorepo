import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
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
export const UISettingsForm = () => {
	const { uiSettings, getUILabel, patchUI, resetUI } = useUISettings('products');
	// Get initial data once - don't subscribe to changes while editing
	const initialData = React.useMemo(() => uiSettings.get(), [uiSettings]);
	const { buttonPressHandlerRef } = useDialogContext();

	/**
	 *
	 */
	const form = useForm<z.infer<typeof schema>>({
		resolver: zodResolver(schema),
		defaultValues: initialData,
	});

	/**
	 * Handle reset button - reset form and RxDB to initial values
	 * Set handler in effect to avoid mutating ref during render
	 */
	const handleReset = React.useCallback(async () => {
		await resetUI();
		// After reset, get fresh data and reset the form
		form.reset(uiSettings.get());
	}, [resetUI, form, uiSettings]);

	// eslint-disable-next-line react-compiler/react-compiler -- intentional ref mutation in effect
	React.useEffect(() => {
		buttonPressHandlerRef.current = handleReset;
	}, [buttonPressHandlerRef, handleReset]);

	/**
	 * Handle form changes and patch UI
	 * The form is the source of truth during editing.
	 * Changes are saved to RxDB but we don't re-sync back to avoid loops.
	 */
	useFormChangeHandler({ form, onChange: patchUI });

	/**
	 *
	 */
	return (
		<Form {...form}>
			<VStack>
				<UISettingsColumnsForm columns={initialData.columns} getUILabel={getUILabel} />
			</VStack>
		</Form>
	);
};
