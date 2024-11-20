import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import toNumber from 'lodash/toNumber';
import toString from 'lodash/toString';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import {
	DialogClose,
	DialogFooter,
	useRootContext,
	DialogAction,
} from '@wcpos/components/src/dialog';
import {
	Form,
	FormField,
	FormSwitch,
	FormInput,
	FormRadioGroup,
	FormSelect,
} from '@wcpos/components/src/form';
import { VStack } from '@wcpos/components/src/vstack';

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
	item: import('@wcpos/database').OrderDocument['shipping_lines'][number];
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
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			method_title: item.method_title,
			method_id: item.method_id,
			instance_id: item.instance_id,
			amount: toNumber(amount),
			prices_include_tax,
			tax_status,
			tax_class: tax_class === '' ? 'standard' : tax_class,
			meta_data: item.meta_data,
		},
	});

	/**
	 *
	 */
	const handleSave = React.useCallback(
		(data: z.infer<typeof formSchema>) => {
			updateShippingLine(uuid, {
				method_title: data.method_title,
				method_id: data.method_id,
				instance_id: data.instance_id,
				amount: String(data.amount),
				tax_status: data.tax_status,
				tax_class: data.tax_class === 'standard' ? '' : data.tax_class,
				prices_include_tax: data.prices_include_tax,
				meta_data: data.meta_data,
			});
			onOpenChange(false);
		},
		[updateShippingLine, uuid, onOpenChange]
	);

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
						<FormInput label={t('Shipping Method Title', { _tags: 'core' })} {...field} />
					)}
				/>
				<View className="grid grid-cols-2 gap-4">
					<FormField
						control={form.control}
						name="method_id"
						render={({ field }) => (
							<FormSelect
								label={t('Shipping Method', { _tags: 'core' })}
								customComponent={ShippingMethodSelect}
								{...field}
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="instance_id"
						render={({ field }) => (
							<FormInput label={t('Instance ID', { _tags: 'core' })} {...field} />
						)}
					/>
					<FormField
						control={form.control}
						name="amount"
						render={({ field }) => (
							<FormInput
								customComponent={CurrencyInput}
								label={t('Amount', { _tags: 'core' })}
								type="numeric"
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
				<MetaDataForm />
				<DialogFooter className="px-0">
					<DialogClose>{t('Close', { _tags: 'core' })}</DialogClose>
					<DialogAction onPress={form.handleSubmit(handleSave)}>
						{t('Save', { _tags: 'core' })}
					</DialogAction>
				</DialogFooter>
			</VStack>
		</Form>
	);
};
