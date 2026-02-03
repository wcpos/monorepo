import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { DialogAction, DialogClose, DialogFooter, useRootContext } from '@wcpos/components/dialog';
import { Form, FormCombobox, FormField, FormInput } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../../../contexts/translations';
import { CurrencySelect } from '../../../../components/currency-select';
import { FormErrors } from '../../../../components/form-errors';
import { MetaDataForm, metaDataSchema } from '../../../../components/meta-data-form';
import { useLocalMutation } from '../../../../hooks/mutations/use-local-mutation';

/**
 *
 */
const formSchema = z.object({
	// number: z.string().optional(), // Order number is read only??!
	currency: z.string().optional(),
	// currency_symbol: z.string().optional(), // Currency symbol is read only
	transaction_id: z.string().optional(),
	meta_data: metaDataSchema,
});

/**
 *
 */
export const EditOrderMetaForm = ({ order, formData }) => {
	const t = useT();
	const { localPatch } = useLocalMutation();
	const { onOpenChange } = useRootContext();

	/**
	 * Use `values` instead of `defaultValues` + useEffect reset pattern.
	 * This makes the form reactive to external data changes (react-hook-form best practice).
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		values: formData,
	});

	/**
	 * Save to local db
	 */
	const handleSave = React.useCallback(
		async (data) => {
			await localPatch({
				document: order,
				data,
			});
			onOpenChange(false);
		},
		[localPatch, onOpenChange, order]
	);

	/**
	 * Form submission handlers that include validation
	 */
	const onSave = form.handleSubmit(handleSave);

	/**
	 *
	 */
	return (
		<Form {...form}>
			<VStack className="gap-4">
				<FormErrors />
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="currency"
						render={({ field }) => (
							<View className="flex-1">
								<FormCombobox customComponent={CurrencySelect} label={t('Currency')} {...field} />
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="transaction_id"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput label={t('Transaction ID')} {...field} />
							</View>
						)}
					/>
				</HStack>
				<MetaDataForm />
				<DialogFooter className="px-0">
					<DialogClose>{t('Cancel')}</DialogClose>
					<DialogAction onPress={onSave}>{t('Save')}</DialogAction>
				</DialogFooter>
			</VStack>
		</Form>
	);
};
