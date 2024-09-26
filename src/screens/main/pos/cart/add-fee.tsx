import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import isEmpty from 'lodash/isEmpty';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/components/src/button';
import { useRootContext } from '@wcpos/components/src/dialog';
import {
	Form,
	FormField,
	FormInput,
	FormSwitch,
	FormSelect,
	FormRadioGroup,
} from '@wcpos/components/src/form';
import { HStack } from '@wcpos/components/src/hstack';
import { VStack } from '@wcpos/components/src/vstack';

import { useT } from '../../../../contexts/translations';
import { AmountWidget, amountWidgetSchema } from '../../components/amount-widget';
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
	...amountWidgetSchema.shape,
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
				name: isEmpty(name) ? t('Fee', { _tags: 'core' }) : name,
				// total: isEmpty(total) ? '0' : total,
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
	 *
	 */
	return (
		<Form {...form}>
			<VStack className="gap-4">
				<VStack>
					<FormField
						control={form.control}
						name="name"
						render={({ field }) => (
							<FormInput
								label={t('Fee Name', { _tags: 'core' })}
								placeholder={t('Fee', { _tags: 'core' })}
								{...field}
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="amount"
						render={({ field }) => (
							<FormInput
								customComponent={AmountWidget}
								label={t('Amount', { _tags: 'core' })}
								currencySymbol="$"
								{...field}
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="prices_include_tax"
						render={({ field }) => (
							<FormSwitch label={t('Amount Includes Tax', { _tags: 'core' })} {...field} />
						)}
					/>
					<View className="grid grid-cols-2 gap-4">
						<FormField
							control={form.control}
							name="tax_class"
							render={({ field }) => (
								<FormSelect
									customComponent={TaxClassSelect}
									label={t('Tax Class', { _tags: 'core' })}
									{...field}
								/>
							)}
						/>
						<FormField
							control={form.control}
							name="tax_status"
							render={({ field }) => (
								<FormRadioGroup
									label={t('Tax Status', { _tags: 'core' })}
									customComponent={TaxStatusRadioGroup}
									{...field}
								/>
							)}
						/>
					</View>
				</VStack>
				<HStack className="justify-end">
					<Button onPress={form.handleSubmit(handleAdd)}>
						<ButtonText>{t('Add to Cart', { _tags: 'core' })}</ButtonText>
					</Button>
				</HStack>
			</VStack>
		</Form>
	);
};
