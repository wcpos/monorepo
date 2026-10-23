import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import toNumber from 'lodash/toNumber';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { DialogBody, DialogClose, DialogFooter } from '@wcpos/components/dialog';
import {
	Form,
	FormField,
	FormInput,
	FormItem,
	FormLabel,
	FormRadioGroup,
	FormSelect,
	FormSwitch,
	SavedFieldProvider,
	SavedMark,
	useFormChangeHandler,
	useMarkSaved,
} from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';

import { useT } from '../../../../../../contexts/translations';
import { CurrencyInput } from '../../../../components/currency-input';
import { FormErrors } from '../../../../components/form-errors';
import { MetaDataForm, metaDataSchema } from '../../../../components/meta-data-form';
import { ShippingMethodSelect } from '../../../../components/shipping-method-select';
import { TaxStatusRadioGroup } from '../../../../components/tax-status-radio-group';
import { useShippingLineData } from '../../../hooks/use-shipping-line-data';
import { useUpdateCartLine } from '../../../hooks/use-update-cart-line';

/**
 * No tax class field — same reason as the Add shipping dialog: WooCommerce has no
 * per-line shipping tax class, so the store's `shipping_tax_class` setting is the only
 * one there is. See `extractShippingLineData` in @wcpos/order-math. Tax STATUS stays:
 * the POS plugin honours it server-side.
 */
const formSchema = z.object({
	method_title: z.string().optional(),
	method_id: z.string().optional(),
	instance_id: z.string().optional(),
	amount: z.number().optional(),
	prices_include_tax: z.boolean().optional(),
	tax_status: z.enum(['taxable', 'none']),
	meta_data: metaDataSchema,
});

interface Props {
	uuid: string;
	item: import('@wcpos/query').OrderShippingLine;
}

/**
 *
 */
export function EditShippingLineForm(props: Props) {
	return (
		<SavedFieldProvider>
			<EditShippingLineFormFields {...props} />
		</SavedFieldProvider>
	);
}

function EditShippingLineFormFields({ uuid, item }: Props) {
	const t = useT();
	const { updateCartLine } = useUpdateCartLine();
	const markSaved = useMarkSaved();
	const { getShippingLineData } = useShippingLineData();
	const { amount, tax_status, prices_include_tax } = getShippingLineData(item);

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
			meta_data: item.meta_data as FormValues['meta_data'],
		},
	});

	useFormChangeHandler({
		form,
		onChange: (changes) => {
			const root = Object.keys(changes)[0].split('.')[0] as keyof FormValues;
			const value = form.getValues(root);
			const wireValue = value;
			return updateCartLine('shipping_lines', uuid, { [root]: wireValue }).then((written) => {
				if (written) markSaved([root]);
			});
		},
	});

	/**
	 *
	 */
	return (
		<Form {...form}>
			<DialogBody contentContainerClassName="gap-4">
				<FormErrors />
				<FormField
					control={form.control}
					name="method_title"
					render={({ field }) => (
						<FormItem>
							<HStack className="justify-between">
								<FormLabel>{t('pos_cart.shipping_method_title')}</FormLabel>
								<SavedMark name="method_title" label={t('settings.saved')} />
							</HStack>
							<FormInput testID="edit-shipping-line-method_title-input" {...field} />
						</FormItem>
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
							<FormItem className="flex-1">
								<HStack className="justify-between">
									<FormLabel>{t('pos_cart.instance_id')}</FormLabel>
									<SavedMark name="instance_id" label={t('settings.saved')} />
								</HStack>
								<FormInput testID="edit-shipping-line-instance_id-input" {...field} />
							</FormItem>
						)}
					/>
				</HStack>
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="amount"
						render={({ field: { value, onChange, ...rest } }) => (
							<FormItem className="flex-1">
								<HStack className="justify-between">
									<FormLabel>{t('pos_cart.amount')}</FormLabel>
									<SavedMark name="amount" label={t('settings.saved')} />
								</HStack>
								<FormInput
									customComponent={CurrencyInput}
									testID="edit-shipping-line-amount-input"
									type="numeric"
									value={value}
									onChange={onChange}
									{...rest}
								/>
							</FormItem>
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
				<FormField
					control={form.control}
					name="tax_status"
					render={({ field: { value, onChange, ...rest } }) => (
						<FormRadioGroup
							label={t('common.tax_status')}
							customComponent={TaxStatusRadioGroup}
							value={value}
							onChange={onChange}
							{...rest}
						/>
					)}
				/>
				<MetaDataForm />
			</DialogBody>
			<DialogFooter>
				<DialogClose>{t('common.close')}</DialogClose>
			</DialogFooter>
		</Form>
	);
}
