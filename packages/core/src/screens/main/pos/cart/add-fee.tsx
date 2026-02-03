import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import isEmpty from 'lodash/isEmpty';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { DialogAction, DialogClose, DialogFooter, useRootContext } from '@wcpos/components/dialog';
import {
	Form,
	FormField,
	FormInput,
	FormRadioGroup,
	FormSelect,
	FormSwitch,
} from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../contexts/translations';
import { CurrencyInput } from '../../components/currency-input';
import { FormErrors } from '../../components/form-errors';
import { NumberInput } from '../../components/number-input';
import { TaxClassSelect } from '../../components/tax-class-select';
import { TaxStatusRadioGroup } from '../../components/tax-status-radio-group';
import { useAddFee } from '../hooks/use-add-fee';

/**
 *
 */
const formSchema = z.object({
	name: z.string().optional(),
	prices_include_tax: z.boolean().optional(),
	tax_status: z.enum(['taxable', 'none']),
	tax_class: z.string().optional(),
	amount: z.string().optional(),
	percent: z.boolean().default(false),
});

/**
 *
 */
export const AddFee = () => {
	const t = useT();
	const { addFee } = useAddFee();
	const { onOpenChange } = useRootContext();

	/**
	 *
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: '',
			amount: '0',
			prices_include_tax: true,
			tax_status: 'taxable',
			tax_class: 'standard',
			percent: false,
		},
	});

	/**
	 * NOTE: tax_class 'standard' needs to be sent as an empty string, otherwise the API will throw an error.
	 */
	const handleAdd = React.useCallback(
		(data) => {
			const {
				name,
				amount,
				percent,
				tax_status,
				tax_class,
				prices_include_tax,
				percent_of_cart_total_with_tax,
			} = data;
			addFee({
				name: isEmpty(name) ? t('Fee') : name,
				amount,
				tax_status,
				tax_class: tax_class === 'standard' ? '' : tax_class,
				percent,
				prices_include_tax,
				percent_of_cart_total_with_tax,
			});
			onOpenChange(false);
		},
		[addFee, onOpenChange, t]
	);

	/**
	 * Form submission handlers that include validation
	 */
	const onAdd = form.handleSubmit(handleAdd);

	/**
	 * Watch for changes to `percent`
	 */
	const togglePercentage = form.watch('percent');

	/**
	 *
	 */
	return (
		<Form {...form}>
			<VStack className="gap-4">
				<FormErrors />
				<FormField
					control={form.control}
					name="name"
					render={({ field }) => (
						<FormInput label={t('Fee Name')} placeholder={t('Fee')} {...field} />
					)}
				/>
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="amount"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput
									customComponent={togglePercentage ? NumberInput : CurrencyInput}
									label={togglePercentage ? t('Percent') : t('Amount')}
									{...field}
								/>
							</View>
						)}
					/>
					<VStack className="flex-1 justify-center">
						<FormField
							control={form.control}
							name="percent"
							render={({ field }) => (
								<FormSwitch label={t('Percentage of Cart Total')} {...field} />
							)}
						/>
						<FormField
							control={form.control}
							name="prices_include_tax"
							render={({ field }) => <FormSwitch label={t('Amount Includes Tax')} {...field} />}
						/>
					</VStack>
				</HStack>
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="tax_class"
						render={({ field }) => (
							<View className="flex-1">
								<FormSelect customComponent={TaxClassSelect} label={t('Tax Class')} {...field} />
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="tax_status"
						render={({ field }) => (
							<View className="flex-1">
								<FormRadioGroup
									label={t('Tax Status')}
									customComponent={TaxStatusRadioGroup}
									{...field}
								/>
							</View>
						)}
					/>
				</HStack>
				<DialogFooter className="px-0">
					<DialogClose>{t('Cancel')}</DialogClose>
					<DialogAction onPress={onAdd}>{t('Add to Cart')}</DialogAction>
				</DialogFooter>
			</VStack>
		</Form>
	);
};
