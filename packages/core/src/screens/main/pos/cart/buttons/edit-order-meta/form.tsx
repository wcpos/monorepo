import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { DialogAction, DialogClose, DialogFooter, useRootContext } from '@wcpos/components/dialog';
import { Form, FormCombobox, FormField, FormInput } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { VStack } from '@wcpos/components/vstack';
import type { OrderDocument } from '@wcpos/database';

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
type FormValues = z.infer<typeof formSchema>;

export const EditOrderMetaForm = ({
	order,
	formData,
}: {
	order: OrderDocument;
	formData: FormValues;
}) => {
	const t = useT();
	const { localPatch } = useLocalMutation();
	const { onOpenChange } = useRootContext();

	/**
	 * Use `values` instead of `defaultValues` + useEffect reset pattern.
	 * This makes the form reactive to external data changes (react-hook-form best practice).
	 */
	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema as never) as never,
		values: formData,
	});

	/**
	 * Save to local db
	 */
	const handleSave = React.useCallback(
		async (data: FormValues) => {
			await localPatch({
				document: order,
				data: data as Partial<OrderDocument>,
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
						render={({ field: { onChange, value, ...rest } }) => (
							<View className="flex-1">
								<FormCombobox
									customComponent={CurrencySelect}
									label={t('common.currency')}
									onChange={onChange}
									value={value ?? ''}
									{...rest}
								/>
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="transaction_id"
						render={({ field: { onChange, value, ...rest } }) => (
							<View className="flex-1">
								<FormInput
									label={t('common.transaction_id')}
									onChange={onChange}
									value={value ?? ''}
									{...rest}
								/>
							</View>
						)}
					/>
				</HStack>
				<MetaDataForm />
				<DialogFooter className="px-0">
					<DialogClose>{t('common.cancel')}</DialogClose>
					<DialogAction onPress={onSave}>{t('common.save')}</DialogAction>
				</DialogFooter>
			</VStack>
		</Form>
	);
};
