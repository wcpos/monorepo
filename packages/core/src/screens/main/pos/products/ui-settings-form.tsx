import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
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

import { useT } from '../../../../contexts/translations';
import {
	columnsFormSchema,
	UISettingsColumnsForm,
	useDialogContext,
} from '../../components/ui-settings';
import { useUISettings } from '../../contexts/ui-settings';

export const schema = z.object({
	showOutOfStock: z.boolean(),
	...columnsFormSchema.shape,
	metaDataKeys: z.string().optional(),
});

/**
 *
 */
export function UISettingsForm() {
	const { uiSettings, getUILabel, patchUI, resetUI } = useUISettings('pos-products');
	// Get initial data once - don't subscribe to changes while editing
	const initialData = React.useMemo(() => uiSettings.get(), [uiSettings]);
	const { setButtonPressHandler } = useDialogContext();
	const t = useT();

	/**
	 *
	 */
	const form = useForm({
		resolver: zodResolver(schema as never) as never,
		defaultValues: initialData,
	});

	/**
	 * Handle reset button - set handler in effect to avoid mutating ref during render
	 */
	const handleReset = React.useCallback(async () => {
		await resetUI();
		form.reset(uiSettings.get());
	}, [resetUI, form, uiSettings]);

	React.useEffect(() => {
		setButtonPressHandler(handleReset);
	}, [setButtonPressHandler, handleReset]);

	/**
	 * Form is the source of truth during editing.
	 * Changes are saved to RxDB but we don't re-sync back to avoid loops.
	 */
	useFormChangeHandler({ form: form as never, onChange: patchUI });

	/**
	 *
	 */
	return (
		<VStack>
			<Form {...form}>
				<VStack>
					<FormField
						control={form.control}
						name="showOutOfStock"
						render={({ field }) => <FormSwitch label={getUILabel('showOutOfStock')} {...field} />}
					/>
					<UISettingsColumnsForm columns={initialData.columns} getUILabel={getUILabel} />
					<FormField
						control={form.control}
						name="metaDataKeys"
						render={({ field }) => (
							<FormInput
								label={getUILabel('metaDataKeys')}
								description={t('pos_products.a_list_of_product_meta_keys')}
								{...field}
							/>
						)}
					/>
				</VStack>
			</Form>
		</VStack>
	);
}
