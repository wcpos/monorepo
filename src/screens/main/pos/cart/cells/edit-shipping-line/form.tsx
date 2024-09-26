import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/components/src/button';
import { DialogClose, useRootContext } from '@wcpos/components/src/dialog';
import {
	Form,
	FormField,
	FormSwitch,
	FormInput,
	FormRadioGroup,
	FormSelect,
} from '@wcpos/components/src/form';
import { HStack } from '@wcpos/components/src/hstack';
import { VStack } from '@wcpos/components/src/vstack';

import { useT } from '../../../../../../contexts/translations';
import { FormErrors } from '../../../../components/form-errors';
import { MetaDataForm, metaDataSchema } from '../../../../components/meta-data-form';
import { NumberInput } from '../../../../components/number-input';
import { ShippingMethodSelect } from '../../../../components/shipping-method-select';
import { TaxClassSelect } from '../../../../components/tax-class-select';
import { TaxStatusRadioGroup } from '../../../../components/tax-status-radio-group';
import { useShippingLineData } from '../../../hooks/use-shipping-line-data';
import { useUpdateShippingLine } from '../../../hooks/use-update-shipping-line';

/**
 *
 */
const formSchema = z.object({
	method_id: z.string().optional(),
	instance_id: z.string().optional(),
	amount: z.string().optional(),
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
			method_id: item.method_id,
			instance_id: item.instance_id,
			amount,
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
			const { method_id, instance_id, amount, tax_status, tax_class, prices_include_tax } = data;
			updateShippingLine(uuid, {
				method_id,
				instance_id,
				amount,
				tax_status,
				tax_class: tax_class === 'standard' ? '' : tax_class,
				prices_include_tax,
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
								customComponent={NumberInput}
								label={t('Amount', { _tags: 'core' })}
								placeholder="0"
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
				<HStack className="justify-end">
					<DialogClose asChild>
						<Button variant="muted">
							<ButtonText>{t('Close', { _tags: 'core' })}</ButtonText>
						</Button>
					</DialogClose>
					<Button onPress={form.handleSubmit(handleSave)}>
						<ButtonText>{t('Save', { _tags: 'core' })}</ButtonText>
					</Button>
				</HStack>
			</VStack>
		</Form>
	);
};
