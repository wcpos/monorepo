import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import toNumber from 'lodash/toNumber';
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

import { useT } from '../../../../../../contexts/translations';
import { CurrencyInput } from '../../../../components/currency-input';
import { FormErrors } from '../../../../components/form-errors';
import { MetaDataForm, metaDataSchema } from '../../../../components/meta-data-form';
import { ShippingMethodSelect } from '../../../../components/shipping-method-select';
import { TaxClassSelect } from '../../../../components/tax-class-select';
import { TaxStatusRadioGroup } from '../../../../components/tax-status-radio-group';
import { useShippingLineData } from '../../../hooks/use-shipping-line-data';
import { useUpdateShippingLine } from '../../../hooks/use-update-shipping-line';

/**
 *
 */
const formSchema = z.object({
	method_title: z.string().optional(),
	method_id: z.string().optional(),
	instance_id: z.string().optional(),
	amount: z.number().optional(),
	prices_include_tax: z.boolean().optional(),
	tax_status: z.enum(['taxable', 'none']),
	tax_class: z.string().optional(),
	meta_data: metaDataSchema,
});

interface Props {
	uuid: string;
	item: NonNullable<import('@wcpos/database').OrderDocument['shipping_lines']>[number];
}

/**
 *
 */
export const EditShippingLineForm = ({ uuid, item }: Props) => {
	const t = useT();
	const { updateShippingLine } = useUpdateShippingLine();
	const { onOpenChange } = useRootContext();
	const { getShippingLineData } = useShippingLineData();
	const { amount, tax_status, tax_class, prices_include_tax } = getShippingLineData(item);

	/**
	 *
	 */
	type FormValues = z.infer<typeof formSchema>;

	const form = useForm<FormValues, unknown, FormValues>({
		resolver: zodResolver(formSchema as never) as never,
		defaultValues: {
			method_title: item.method_title ?? undefined,
			method_id: item.method_id ?? undefined,
			instance_id: item.instance_id,
			amount: toNumber(amount),
			prices_include_tax,
			tax_status,
			tax_class: tax_class === '' ? 'standard' : tax_class,
			meta_data: item.meta_data as FormValues['meta_data'],
		},
	});

	/**
	 *
	 */
	const handleSave = React.useCallback(
		(data: FormValues) => {
			updateShippingLine(uuid, {
				method_title: data.method_title,
				method_id: data.method_id,
				instance_id: data.instance_id,
				amount: data.amount,
				tax_status: data.tax_status,
				tax_class: data.tax_class === 'standard' ? '' : data.tax_class,
				prices_include_tax: data.prices_include_tax,
				meta_data: data.meta_data as NonNullable<
					import('@wcpos/database').OrderDocument['shipping_lines']
				>[number]['meta_data'],
			});
			onOpenChange(false);
		},
		[updateShippingLine, uuid, onOpenChange]
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
				<FormField
					control={form.control}
					name="method_title"
					render={({ field }) => (
						<FormInput label={t('pos_cart.shipping_method_title')} {...field} />
					)}
				/>
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="method_id"
						render={({ field: { value, onChange, ...rest } }) => (
							<View className="flex-1">
								<FormSelect
									label={t('pos_cart.shipping_method')}
									customComponent={ShippingMethodSelect}
									value={value ?? ''}
									onChange={onChange}
									{...rest}
								/>
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="instance_id"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput label={t('pos_cart.instance_id')} {...field} />
							</View>
						)}
					/>
				</HStack>
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="amount"
						render={({ field: { value, onChange, ...rest } }) => (
							<View className="flex-1">
								<FormInput
									customComponent={CurrencyInput}
									label={t('pos_cart.amount')}
									type="numeric"
									value={value}
									onChange={onChange}
									{...rest}
								/>
							</View>
						)}
					/>
					<View className="flex-1 justify-center">
						<FormField
							control={form.control}
							name="prices_include_tax"
							render={({ field }) => (
								<FormSwitch label={t('pos_cart.amount_includes_tax')} {...field} />
							)}
						/>
					</View>
				</HStack>
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="tax_class"
						render={({ field: { value, onChange, ...rest } }) => (
							<View className="flex-1">
								<FormSelect
									label={t('common.tax_class')}
									customComponent={TaxClassSelect}
									value={value ?? ''}
									onChange={onChange}
									{...rest}
								/>
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="tax_status"
						render={({ field: { value, onChange, ...rest } }) => (
							<View className="flex-1">
								<FormRadioGroup
									label={t('common.tax_status')}
									customComponent={TaxStatusRadioGroup}
									value={value}
									onChange={onChange}
									{...rest}
								/>
							</View>
						)}
					/>
				</HStack>
				<MetaDataForm />
				<DialogFooter className="px-0">
					<DialogClose>{t('common.close')}</DialogClose>
					<DialogAction onPress={onSave}>{t('common.save')}</DialogAction>
				</DialogFooter>
			</VStack>
		</Form>
	);
};
