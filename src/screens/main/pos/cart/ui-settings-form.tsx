import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useObservableState } from 'observable-hooks';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import {
	Form,
	FormField,
	FormSwitch,
	FormInput,
	useFormChangeHandler,
} from '@wcpos/components/src/form';
import { VStack } from '@wcpos/components/src/vstack';

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
	 *
	 */
	useFormChangeHandler({ form, onChange: patchUI });

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
