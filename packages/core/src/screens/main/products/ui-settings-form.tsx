import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Form, useFormChangeHandler } from '@wcpos/components/form';
import { VStack } from '@wcpos/components/vstack';
import { useDocField } from '@wcpos/query';

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
	const { uiSettings, getUILabel, patchUI, resetUI } = useUISettings('products');
	const formData = useDocField(uiSettings, (value) => value);
	const { setButtonPressHandler } = useDialogContext();

	/**
	 *
	 */
	const form = useForm<z.infer<typeof schema>>({
		resolver: zodResolver(schema as never) as never,
		values: formData,
	});

	/**
	 * The reset button lives in the dialog footer, outside this form's subtree, so the
	 * handler has to be published back up to UISettingsDialog. It lands in a ref there,
	 * and writing a ref during render is not allowed — hence an effect rather than a
	 * plain call. Nothing here derives state; it only registers the callback.
	 */
	React.useEffect(() => {
		setButtonPressHandler(() => void resetUI());
	}, [setButtonPressHandler, resetUI]);

	useFormChangeHandler({ form: form as never, onChange: (changes) => void patchUI(changes) });

	/**
	 *
	 */
	return (
		<Form {...form}>
			<VStack>
				<UISettingsColumnsForm getUILabel={getUILabel} />
			</VStack>
		</Form>
	);
}
