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
	FormSegmentedControl,
	FormSelect,
	FormSwitch,
	SavedMark,
} from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { DialogBody, DialogFooter } from '@wcpos/components/dialog';

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
	footer: React.ReactNode;
	/** The record's own actions (the edit modal's Delete, Sync), on the footer's left. */
	footerLeading?: React.ReactNode;
}

export function CouponForm({ form, footer, footerLeading }: CouponFormProps) {
	const t = useT();
	const { format } = useCurrencyFormat();

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
			<DialogBody contentContainerClassName="gap-4">
				<FormErrors />

				{/* 1. Code + generate */}
				<FormField
					control={form.control}
					name="code"
					render={({ field }) => (
						<HStack className="w-full items-end gap-2">
							<FormItem className="flex-1">
								<HStack className="justify-between">
									<FormLabel>{t('coupons.code')}</FormLabel>
									<SavedMark name="code" label={t('settings.saved')} />
								</HStack>
								<FormInput testID="coupon-code" {...field} />
							</FormItem>
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
						<FormSegmentedControl
							testID="coupon-discount-type"
							label={t('coupons.discount')}
							segments={[
								{ value: 'percent', label: t('coupons.percent_short') },
								{ value: 'fixed_cart', label: t('coupons.amount_off_order') },
								{ value: 'fixed_product', label: t('coupons.amount_off_products') },
							]}
							{...field}
							onChange={(value) => {
								field.onChange(value);
								if (value === 'fixed_cart') {
									form.setValue('limit_usage_to_x_items', 0, { shouldDirty: true });
								}
							}}
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
							<HStack className="justify-between">
								<FormLabel>{t('coupons.expires')}</FormLabel>
								<SavedMark name="date_expires_gmt" label={t('settings.saved')} />
							</HStack>
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
								<FormItem className="flex-1">
									<HStack className="justify-between">
										<FormLabel>{t('coupons.minimum_spend')}</FormLabel>
										<SavedMark name="minimum_amount" label={t('settings.saved')} />
									</HStack>
									<FormInput
										customComponent={CurrencyInput}
										placeholder={t('coupons.no_minimum')}
										{...field}
										value={field.value ?? ''}
										onChange={field.onChange}
									/>
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="maximum_amount"
							render={({ field }) => (
								<FormItem className="flex-1">
									<HStack className="justify-between">
										<FormLabel>{t('coupons.maximum_spend')}</FormLabel>
										<SavedMark name="maximum_amount" label={t('settings.saved')} />
									</HStack>
									<FormInput
										customComponent={CurrencyInput}
										placeholder={t('coupons.no_maximum')}
										{...field}
										value={field.value ?? ''}
										onChange={field.onChange}
									/>
								</FormItem>
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
								<FormItem className="flex-1">
									<HStack className="justify-between">
										<FormLabel>{t('coupons.total_uses')}</FormLabel>
										<SavedMark name="usage_limit" label={t('settings.saved')} />
									</HStack>
									<FormInput
										placeholder={t('coupons.unlimited')}
										keyboardType="number-pad"
										{...field}
										value={fromUsageLimit(field.value)}
										onChange={(text) => field.onChange(toUsageLimit(text))}
									/>
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="usage_limit_per_user"
							render={({ field }) => (
								<FormItem className="flex-1">
									<HStack className="justify-between">
										<FormLabel>{t('coupons.uses_per_customer')}</FormLabel>
										<SavedMark name="usage_limit_per_user" label={t('settings.saved')} />
									</HStack>
									<FormInput
										placeholder={t('coupons.unlimited')}
										keyboardType="number-pad"
										{...field}
										value={fromUsageLimit(field.value)}
										onChange={(text) => field.onChange(toUsageLimit(text))}
									/>
								</FormItem>
							)}
						/>
					</HStack>
					{showMaxItems && (
						<HStack className="w-full gap-4">
							<FormField
								control={form.control}
								name="limit_usage_to_x_items"
								render={({ field }) => (
									<FormItem className="flex-1">
										<HStack className="justify-between">
											<FormLabel>{t('coupons.max_discounted_items')}</FormLabel>
											<SavedMark name="limit_usage_to_x_items" label={t('settings.saved')} />
										</HStack>
										<FormInput
											placeholder={t('coupons.all_eligible_items')}
											keyboardType="number-pad"
											{...field}
											value={fromUsageLimit(field.value)}
											onChange={(text) => field.onChange(toUsageLimit(text))}
										/>
									</FormItem>
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
							<FormItem>
								<HStack className="justify-between">
									<FormLabel>{t('coupons.internal_note')}</FormLabel>
									<SavedMark name="description" label={t('settings.saved')} />
								</HStack>
								<FormInput
									description={t('coupons.internal_note_help')}
									{...field}
									value={field.value ?? ''}
									multiline
								/>
							</FormItem>
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
			</DialogBody>
			{footerLeading ? (
				// Two wrapping groups: the record's actions on the left, the footer on the right.
				<DialogFooter className="flex-wrap justify-between">
					<View className="min-w-0 shrink flex-row flex-wrap gap-2">{footerLeading}</View>
					<View className="min-w-0 shrink flex-row flex-wrap gap-2">{footer}</View>
				</DialogFooter>
			) : (
				<DialogFooter>{footer}</DialogFooter>
			)}
		</Form>
	);
}
