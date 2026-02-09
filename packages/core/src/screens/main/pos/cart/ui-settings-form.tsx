import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useObservableState } from 'observable-hooks';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import {
	Form,
	FormField,
	FormInput,
	FormSwitch,
	useFormChangeHandler,
} from '@wcpos/components/form';
import { VStack } from '@wcpos/components/vstack';

import {
	columnsFormSchema,
	UISettingsColumnsForm,
	useDialogContext,
} from '../../components/ui-settings';
import { useUISettings } from '../../contexts/ui-settings';

export const schema = z.object({
	autoShowReceipt: z.boolean(),
	autoPrintReceipt: z.boolean(),
	// quickDiscounts: z.array(z.number()).optional(),
	quickDiscounts: z.string().optional(),
	...columnsFormSchema.shape,
});

/**
 *
 */
export const UISettingsForm = () => {
	const { uiSettings, getUILabel, resetUI, patchUI } = useUISettings('pos-cart');
	const formData = useObservableState(uiSettings.$, uiSettings.get());
	const { setButtonPressHandler } = useDialogContext();

	React.useEffect(() => {
		setButtonPressHandler(resetUI);
	}, [setButtonPressHandler, resetUI]);

	/**
	 * Use `values` instead of `defaultValues` + useEffect reset pattern.
	 * This makes the form reactive to external data changes (react-hook-form best practice).
	 */
	const form = useForm({
		resolver: zodResolver(schema as never) as never,
		values: formData,
	});

	/**
	 *
	 */
	useFormChangeHandler({ form: form as never, onChange: patchUI });

	/**
	 *
	 */
	return (
		<VStack space="lg">
			<Form {...form}>
				<VStack>
					<FormField
						control={form.control}
						name="autoShowReceipt"
						render={({ field }) => <FormSwitch label={getUILabel('autoShowReceipt')} {...field} />}
					/>
					<FormField
						control={form.control}
						name="autoPrintReceipt"
						render={({ field }) => <FormSwitch label={getUILabel('autoPrintReceipt')} {...field} />}
					/>
					<FormField
						control={form.control}
						name="quickDiscounts"
						render={({ field }) => <FormInput label={getUILabel('quickDiscounts')} {...field} />}
					/>
					<UISettingsColumnsForm columns={formData.columns} getUILabel={getUILabel} />
				</VStack>
			</Form>
		</VStack>
	);
};
