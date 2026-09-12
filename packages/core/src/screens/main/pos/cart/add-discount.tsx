import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import * as z from 'zod';

import {
	DialogAction,
	DialogBody,
	DialogClose,
	DialogFooter,
	useRootContext,
} from '@wcpos/components/dialog';
import { Form, FormField, FormInput, FormSwitch } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../contexts/translations';
import { CurrencyInput } from '../../components/currency-input';
import { FormErrors } from '../../components/form-errors';
import { NumberInput } from '../../components/number-input';
import { QUICK_DISCOUNT_META_KEY, readQuickDiscountIntent } from '../hooks/quick-discount';
import { useAddQuickDiscount } from '../hooks/use-add-quick-discount';

export function AddDiscount() {
	const t = useT();
	const { addQuickDiscount } = useAddQuickDiscount();
	const { onOpenChange } = useRootContext();
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
		if (result.success) onOpenChange(false);
		else form.setError('root', { message: result.error });
	});

	return (
		<Form {...form}>
			<DialogBody contentContainerClassName="gap-4">
				<FormErrors />
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="amount"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput
									customComponent={percent ? NumberInput : CurrencyInput}
									label={percent ? t('pos_cart.percent') : t('pos_cart.amount')}
									testID="discount-amount-input"
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
								<FormSwitch
									label={t('pos_cart.percent')}
									testID="discount-percent-switch"
									{...field}
								/>
							)}
						/>
					</VStack>
				</HStack>
			</DialogBody>
			<DialogFooter>
				<DialogClose>{t('common.cancel')}</DialogClose>
				<DialogAction
					disabled={form.formState.isSubmitting}
					testID="add-discount-submit"
					onPress={onAdd}
				>
					{t('pos_cart.add_discount')}
				</DialogAction>
			</DialogFooter>
		</Form>
	);
}
