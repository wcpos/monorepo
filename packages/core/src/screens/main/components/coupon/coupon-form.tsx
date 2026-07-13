import * as React from 'react';
import { View } from 'react-native';

import { useWatch } from 'react-hook-form';
import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/components/button';
import {
	Form,
	FormField,
	FormInput,
	FormItem,
	FormLabel,
	FormMessage,
	FormSelect,
	FormSwitch,
	FormToggleGroup,
} from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { VStack } from '@wcpos/components/vstack';

import { CollapsibleSection } from './collapsible-section';
import { couponFormSchema } from './coupon-schema';
import { DiscountAmountInput } from './discount-amount-input';
import { ExpiryPresetChips } from './expiry-preset-chips';
import { generateCouponCode } from './generate-code';
import {
	hasRestrictions,
	hasUsageLimits,
	restrictionsSummary,
	usageLimitsSummary,
} from './section-summaries';
import { StatusSelect } from './status-select';
import { fromUsageLimit, isOneTimeUse, toggleOneTimeUse, toUsageLimit } from './usage-limit';
import { useT } from '../../../../contexts/translations';
import { CurrencyInput } from '../../components/currency-input';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
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
	const { format } = useCurrencyFormat();

	const onSave = form.handleSubmit(onSubmit);

	// Live values drive affixes, conditional fields, and collapsed summaries.
	const values = useWatch({ control: form.control });
	const discountType = values.discount_type ?? 'percent';
	const showMaxItems = discountType === 'percent' || discountType === 'fixed_product';

	// Sections auto-expand when they already contain configuration (edit mode);
	// computed once from the mount-time values so typing doesn't collapse/expand.
	const [initialValues] = React.useState(() => form.getValues());
	const restrictionsDefaultOpen = hasRestrictions(initialValues);
	const usageDefaultOpen =
		hasUsageLimits(initialValues) && !isOneTimeUse(initialValues.usage_limit);
	const moreDefaultOpen =
		!!initialValues.description || (initialValues.status ?? 'publish') !== 'publish';

	const statusLabel =
		values.status === 'draft'
			? t('coupons.draft')
			: values.status === 'pending'
				? t('coupons.pending')
				: t('coupons.active');

	return (
		<Form {...form}>
			<VStack className="gap-4">
				<FormErrors />

				{/* 1. Code + generate */}
				<FormField
					control={form.control}
					name="code"
					render={({ field }) => (
						<HStack className="w-full items-end gap-2">
							<View className="flex-1">
								<FormInput label={t('coupons.code')} testID="coupon-code" {...field} />
							</View>
							<Button
								variant="outline"
								testID="coupon-generate-code"
								onPress={() => form.setValue('code', generateCouponCode(), { shouldDirty: true })}
							>
								<ButtonText>{t('coupons.generate')}</ButtonText>
							</Button>
						</HStack>
					)}
				/>

				{/* 2. Unified discount control: type before amount */}
				<FormField
					control={form.control}
					name="discount_type"
					render={({ field }) => (
						<FormToggleGroup
							label={t('coupons.discount')}
							options={[
								{ value: 'percent', label: t('coupons.percent_short') },
								{ value: 'fixed_cart', label: t('coupons.amount_off_order') },
								{ value: 'fixed_product', label: t('coupons.amount_off_products') },
							]}
							{...field}
						/>
					)}
				/>
				<FormField
					control={form.control}
					name="amount"
					render={({ field }) => (
						<FormItem>
							<DiscountAmountInput
								discountType={discountType}
								value={field.value ?? ''}
								onChange={(value) => field.onChange(String(value))}
							/>
							<FormMessage />
						</FormItem>
					)}
				/>

				{/* 3. Expiry presets */}
				<FormField
					control={form.control}
					name="date_expires_gmt"
					render={({ field }) => (
						<FormItem>
							<FormLabel>{t('coupons.expires')}</FormLabel>
							<ExpiryPresetChips value={field.value} onChange={field.onChange} />
							<FormMessage />
						</FormItem>
					)}
				/>

				{/* 4. One-time use */}
				<FormField
					control={form.control}
					name="usage_limit"
					render={({ field }) => (
						<FormSwitch
							{...field}
							label={t('coupons.one_time_use')}
							description={t('coupons.one_time_use_help')}
							testID="coupon-one-time-use"
							value={isOneTimeUse(field.value)}
							onChange={(checked: boolean) => field.onChange(toggleOneTimeUse(checked))}
						/>
					)}
				/>

				{/* 5. Restrictions */}
				<CollapsibleSection
					title={t('coupons.restrictions')}
					summary={restrictionsSummary(values, t, (amount) => format(Number(amount)))}
					defaultOpen={restrictionsDefaultOpen}
					testID="coupon-section-restrictions"
				>
					<HStack className="w-full gap-4">
						<FormField
							control={form.control}
							name="minimum_amount"
							render={({ field }) => (
								<View className="flex-1">
									<FormInput
										customComponent={CurrencyInput}
										label={t('coupons.minimum_spend')}
										placeholder={t('coupons.no_minimum')}
										{...field}
										value={field.value ?? ''}
										onChange={field.onChange}
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
										customComponent={CurrencyInput}
										label={t('coupons.maximum_spend')}
										placeholder={t('coupons.no_maximum')}
										{...field}
										value={field.value ?? ''}
										onChange={field.onChange}
									/>
								</View>
							)}
						/>
					</HStack>
					<FormField
						control={form.control}
						name="individual_use"
						render={({ field }) => (
							<FormSwitch
								label={t('coupons.cannot_be_combined')}
								description={t('coupons.cannot_be_combined_help')}
								{...field}
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="free_shipping"
						render={({ field }) => (
							<FormSwitch label={t('coupons.grants_free_shipping')} {...field} />
						)}
					/>
				</CollapsibleSection>

				{/* 6. Usage limits */}
				<CollapsibleSection
					title={t('coupons.usage_limits')}
					summary={usageLimitsSummary(values, t)}
					defaultOpen={usageDefaultOpen}
					testID="coupon-section-usage-limits"
				>
					<HStack className="w-full gap-4">
						<FormField
							control={form.control}
							name="usage_limit"
							render={({ field }) => (
								<View className="flex-1">
									<FormInput
										label={t('coupons.total_uses')}
										placeholder={t('coupons.unlimited')}
										keyboardType="number-pad"
										{...field}
										value={fromUsageLimit(field.value)}
										onChange={(text) => field.onChange(toUsageLimit(text))}
									/>
								</View>
							)}
						/>
						<FormField
							control={form.control}
							name="usage_limit_per_user"
							render={({ field }) => (
								<View className="flex-1">
									<FormInput
										label={t('coupons.uses_per_customer')}
										placeholder={t('coupons.unlimited')}
										keyboardType="number-pad"
										{...field}
										value={fromUsageLimit(field.value)}
										onChange={(text) => field.onChange(toUsageLimit(text))}
									/>
								</View>
							)}
						/>
					</HStack>
					{showMaxItems && (
						<HStack className="w-full gap-4">
							<FormField
								control={form.control}
								name="limit_usage_to_x_items"
								render={({ field }) => (
									<View className="flex-1">
										<FormInput
											label={t('coupons.max_discounted_items')}
											placeholder={t('coupons.all_eligible_items')}
											keyboardType="number-pad"
											{...field}
											value={fromUsageLimit(field.value)}
											onChange={(text) => field.onChange(toUsageLimit(text))}
										/>
									</View>
								)}
							/>
							<View className="flex-1" />
						</HStack>
					)}
				</CollapsibleSection>

				{/* 7. More options */}
				<CollapsibleSection
					title={t('coupons.more_options')}
					summary={statusLabel}
					defaultOpen={moreDefaultOpen}
					testID="coupon-section-more-options"
				>
					<FormField
						control={form.control}
						name="description"
						render={({ field }) => (
							<FormInput
								label={t('coupons.internal_note')}
								description={t('coupons.internal_note_help')}
								{...field}
								value={field.value ?? ''}
								multiline
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="status"
						render={({ field: { value, onChange, ...rest } }) => (
							<FormSelect
								customComponent={StatusSelect}
								label={t('coupons.status')}
								value={value as string}
								onChange={onChange}
								{...rest}
							/>
						)}
					/>
					<MetaDataForm />
				</CollapsibleSection>

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
