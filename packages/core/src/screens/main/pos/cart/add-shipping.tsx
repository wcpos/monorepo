import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import isEmpty from 'lodash/isEmpty';
import { useObservableEagerState } from 'observable-hooks';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import {
	DialogAction,
	DialogClose,
	DialogFooter,
	useRootContext,
} from '@wcpos/components/src/dialog';
import {
	Form,
	FormField,
	FormInput,
	FormSwitch,
	FormRadioGroup,
	FormSelect,
} from '@wcpos/components/src/form';
import { VStack } from '@wcpos/components/src/vstack';

import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { CurrencyInput } from '../../components/currency-input';
import { FormErrors } from '../../components/form-errors';
import { ShippingMethodSelect } from '../../components/shipping-method-select';
import { TaxClassSelect } from '../../components/tax-class-select';
import { TaxStatusRadioGroup } from '../../components/tax-status-radio-group';
import { useAddShipping } from '../hooks/use-add-shipping';

const formSchema = z.object({
	method_title: z.string().optional(),
	method_id: z.string().optional(),
	amount: z.string().optional(),
	prices_include_tax: z.boolean().optional(),
	tax_status: z.enum(['taxable', 'none']),
	tax_class: z.string().optional(),
});

/**
 *
 */
export const AddShipping = () => {
	const t = useT();
	const { addShipping } = useAddShipping();
	const { onOpenChange } = useRootContext();
	const { store } = useAppState();
	const shippingTaxClass = useObservableEagerState(store.shipping_tax_class$);

	/**
	 *
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			method_title: '',
			method_id: '',
			amount: '0',
			prices_include_tax: true,
			tax_status: 'taxable',
			tax_class: shippingTaxClass,
		},
	});

	/**
	 * NOTE: tax_class 'standard' needs to be sent as an empty string, otherwise the API will throw an error.
	 */
	const handleAdd = React.useCallback(
		(data: z.infer<typeof formSchema>) => {
			const { method_title, method_id, amount, tax_status, tax_class, prices_include_tax } = data;

			addShipping({
				method_title: isEmpty(method_title) ? t('Shipping', { _tags: 'core' }) : method_title,
				method_id: isEmpty(method_id) ? 'local_pickup' : method_id,
				amount: isEmpty(amount) ? '0' : amount,
				tax_status,
				tax_class: tax_class === 'standard' ? '' : tax_class,
				prices_include_tax,
			});
			onOpenChange(false);
		},
		[addShipping, onOpenChange, t]
	);

	/**
	 *
	 */
	return (
		<Form {...form}>
			<VStack className="gap-4">
				<FormErrors />
				<VStack>
					<View className="grid grid-cols-2 gap-4">
						<FormField
							control={form.control}
							name="method_title"
							render={({ field }) => (
								<FormInput
									label={t('Shipping Method Title', { _tags: 'core' })}
									placeholder={t('Shipping', { _tags: 'core' })}
									{...field}
								/>
							)}
						/>
						<FormField
							control={form.control}
							name="method_id"
							render={({ field }) => (
								<FormSelect
									customComponent={ShippingMethodSelect}
									label={t('Shipping Method', { _tags: 'core' })}
									{...field}
								/>
							)}
						/>
						<FormField
							control={form.control}
							name="amount"
							render={({ field }) => (
								<FormInput
									customComponent={CurrencyInput}
									label={t('Amount', { _tags: 'core' })}
									{...field}
								/>
							)}
						/>
						<View className="justify-center">
							<FormField
								control={form.control}
								name="prices_include_tax"
								render={({ field }) => (
									<FormSwitch label={t('Amount Includes Tax', { _tags: 'core' })} {...field} />
								)}
							/>
						</View>
						<FormField
							control={form.control}
							name="tax_class"
							render={({ field }) => (
								<FormSelect
									label={t('Tax Class', { _tags: 'core' })}
									customComponent={TaxClassSelect}
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
				<DialogFooter className="px-0">
					<DialogClose>{t('Cancel', { _tags: 'core' })}</DialogClose>
					<DialogAction onPress={form.handleSubmit(handleAdd)}>
						{t('Add to Cart', { _tags: 'core' })}
					</DialogAction>
				</DialogFooter>
			</VStack>
		</Form>
	);
};
