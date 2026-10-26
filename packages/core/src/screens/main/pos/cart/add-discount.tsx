import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import * as z from 'zod';

import { DialogBody, DialogFooter, useDialog } from '@wcpos/components/dialog';
import { Form, FormField, FormInput, FormItem } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { PropertyList, PropertyRow } from '@wcpos/components/property-row';

import { useT } from '../../../../contexts/translations';
import { AmountUnitToggle } from '../../components/amount-unit-toggle';
import { CurrencyInput } from '../../components/currency-input';
import { FormErrors } from '../../components/form-errors';
import { NumberInput } from '../../components/number-input';
import { QUICK_DISCOUNT_META_KEY, readQuickDiscountIntent } from '../hooks/quick-discount';
import { useAddQuickDiscount } from '../hooks/use-add-quick-discount';

export function AddDiscount() {
	const t = useT();
	const { addQuickDiscount } = useAddQuickDiscount();
	const { close: closeDialog } = useDialog();
	const schema = z.object({ amount: z.string(), percent: z.boolean() }).transform((data, ctx) => {
		const intent = readQuickDiscountIntent({
			meta_data: [
				{
					key: QUICK_DISCOUNT_META_KEY,
					value: { discount_type: data.percent ? 'percent' : 'fixed_cart', amount: data.amount },
				},
			],
		});
		if (intent) return { amount: intent.amount, percent: data.percent };
		ctx.addIssue({
			code: 'custom',
			path: ['amount'],
			message: data.percent
				? t('pos_cart.discount_percent_invalid')
				: t('pos_cart.discount_amount_invalid'),
		});
		return z.NEVER;
	});
	const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
		resolver: zodResolver(schema as never) as never,
		defaultValues: { amount: '0', percent: false },
	});
	const percent = useWatch({ control: form.control, name: 'percent' });
	const onAdd = form.handleSubmit(async (data) => {
		const result = await addQuickDiscount({
			discount_type: data.percent ? 'percent' : 'fixed_cart',
			amount: data.amount,
		});
		if (result.success) closeDialog();
		else form.setError('root', { message: result.error });
	});

	return (
		<Form {...form}>
			<DialogBody contentContainerClassName="gap-4">
				<FormErrors />
				<PropertyList>
					<PropertyRow label={t('pos_cart.amount')} nativeID="discount-amount-form-item">
						<HStack className="gap-2">
							<FormField
								control={form.control}
								name="amount"
								render={({ field }) => (
									<FormItem nativeID="discount-amount" className="flex-1">
										<FormInput
											customComponent={percent ? NumberInput : CurrencyInput}
											testID="discount-amount-input"
											{...field}
										/>
									</FormItem>
								)}
							/>
							<AmountUnitToggle
								percent={percent}
								onChange={(next) => form.setValue('percent', next)}
								testID="discount-percent-switch"
							/>
						</HStack>
					</PropertyRow>
				</PropertyList>
			</DialogBody>
			<DialogFooter
				close
				intent={{
					label: t('pos_cart.add_discount'),
					disabled: form.formState.isSubmitting,
					testID: 'add-discount-submit',
					onPress: () => void onAdd(),
				}}
			/>
		</Form>
	);
}
