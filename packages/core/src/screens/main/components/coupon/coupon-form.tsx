import * as React from 'react';
import { View } from 'react-native';

import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/components/button';
import { Form, FormField, FormInput, FormSelect, FormSwitch } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { VStack } from '@wcpos/components/vstack';

import { couponFormSchema } from './coupon-schema';
import { DiscountTypeSelect } from './discount-type-select';
import { useT } from '../../../../contexts/translations';
import { FormErrors } from '../form-errors';
import { MetaDataForm } from '../meta-data-form';

export { couponFormSchema } from './coupon-schema';

interface CouponFormProps {
	form: ReturnType<typeof import('react-hook-form').useForm<z.infer<typeof couponFormSchema>>>;
	onClose: () => void;
	onSubmit: (data: z.infer<typeof couponFormSchema>) => void;
	loading: boolean;
}

export function CouponForm({ form, onClose, onSubmit, loading }: CouponFormProps) {
	const t = useT();

	const onSave = form.handleSubmit(onSubmit);

	return (
		<Form {...form}>
			<VStack className="gap-4">
				<FormErrors />
				<HStack className="w-full gap-4">
					<FormField
						control={form.control}
						name="code"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput label={t('coupons.code')} {...field} />
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="amount"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput label={t('coupons.amount')} {...field} value={field.value ?? ''} />
							</View>
						)}
					/>
				</HStack>
				<HStack className="w-full gap-4">
					<FormField
						control={form.control}
						name="discount_type"
						render={({ field: { value, onChange, ...rest } }) => (
							<View className="flex-1">
								<FormSelect
									customComponent={DiscountTypeSelect}
									label={t('coupons.discount_type')}
									value={value as string}
									onChange={onChange}
									{...rest}
								/>
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="date_expires_gmt"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput
									label={t('coupons.expiry_date')}
									{...field}
									value={field.value ?? ''}
									placeholder="YYYY-MM-DDTHH:MM:SS"
								/>
							</View>
						)}
					/>
				</HStack>
				<FormField
					control={form.control}
					name="description"
					render={({ field }) => (
						<FormInput
							label={t('coupons.description')}
							{...field}
							value={field.value ?? ''}
							multiline
						/>
					)}
				/>
				<HStack className="w-full gap-4">
					<FormField
						control={form.control}
						name="minimum_amount"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput
									label={t('coupons.minimum_amount')}
									{...field}
									value={field.value ?? ''}
								/>
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="maximum_amount"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput
									label={t('coupons.maximum_amount')}
									{...field}
									value={field.value ?? ''}
								/>
							</View>
						)}
					/>
				</HStack>
				<HStack className="w-full gap-4">
					<FormField
						control={form.control}
						name="individual_use"
						render={({ field }) => <FormSwitch label={t('coupons.individual_use')} {...field} />}
					/>
					<FormField
						control={form.control}
						name="free_shipping"
						render={({ field }) => <FormSwitch label={t('coupons.free_shipping')} {...field} />}
					/>
				</HStack>
				<MetaDataForm />
				<HStack className="justify-end">
					<Button variant="outline" onPress={onClose}>
						<ButtonText>{t('common.close')}</ButtonText>
					</Button>
					<Button loading={loading} onPress={onSave}>
						<ButtonText>{t('common.save')}</ButtonText>
					</Button>
				</HStack>
			</VStack>
		</Form>
	);
}
