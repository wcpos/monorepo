import * as React from 'react';

import { useWatch } from 'react-hook-form';
import * as z from 'zod';

import {
	Form,
	FormField,
	FormInput,
	FormItem,
	FormMessage,
	FormSegmentedControl,
	FormSelect,
	FormSwitch,
} from '@wcpos/components/form';
import {
	PropertyAdd,
	PropertyAddRow,
	PropertyList,
	PropertyRow,
	PropertyVerb,
} from '@wcpos/components/property-row';
import { DialogBody, DialogFooter, type DialogFooterProps } from '@wcpos/components/dialog';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { couponFormSchema } from './coupon-schema';
import { DiscountAmountInput } from './discount-amount-input';
import { ExpiryPresetChips } from './expiry-preset-chips';
import { generateCouponCode } from './generate-code';
import { StatusSelect } from './status-select';
import {
	fromUsageLimit,
	isOneTimeUse,
	NO_USAGE_LIMIT,
	toggleOneTimeUse,
	toUsageLimit,
} from './usage-limit';
import { useT } from '../../../../contexts/translations';
import { CurrencyInput } from '../../components/currency-input';
import { FormErrors } from '../form-errors';
import { META_DATA_DEFAULT_ROW, MetaDataForm } from '../meta-data-form';
import { useFieldPresence } from '../use-field-presence';

export { couponFormSchema } from './coupon-schema';

type Values = z.infer<typeof couponFormSchema>;

interface CouponFormProps {
	form: ReturnType<typeof import('react-hook-form').useForm<Values>>;
	footer: DialogFooterProps;
}

/**
 * The offered facts in canonical order (Custom field follows), and what Remove writes back: no
 * amount, no limit (0 clears, see usage-limit.ts), a switch off.
 */
const OFFERED = [
	{ name: 'minimum_amount', cleared: '' },
	{ name: 'maximum_amount', cleared: '' },
	{ name: 'usage_limit', cleared: NO_USAGE_LIMIT },
	{ name: 'usage_limit_per_user', cleared: NO_USAGE_LIMIT },
	{ name: 'limit_usage_to_x_items', cleared: NO_USAGE_LIMIT },
	{ name: 'individual_use', cleared: false },
	{ name: 'free_shipping', cleared: false },
	{ name: 'description', cleared: '' },
] as const;
type Offered = (typeof OFFERED)[number]['name'];
type Limit = 'usage_limit' | 'usage_limit_per_user' | 'limit_usage_to_x_items';
/** An off-by-default switch arrives switched on (property rows rule 7). */
const SWITCHES: readonly Offered[] = ['individual_use', 'free_shipping'];

export function CouponForm({ form, footer }: CouponFormProps) {
	const t = useT();
	const values = useWatch({ control: form.control });
	const discountType = values.discount_type ?? 'percent';
	const showMaxItems = discountType === 'percent' || discountType === 'fixed_product';
	const write = (name: keyof Values, value: unknown) =>
		form.setValue(name, value as never, { shouldDirty: true });

	// Total uses is a fact only while One-time use is off: one-time IS a total of one.
	const presence = useFieldPresence(
		OFFERED.filter(({ name }) => showMaxItems || name !== 'limit_usage_to_x_items'),
		(name) => !values[name] || (name === 'usage_limit' && isOneTimeUse(values.usage_limit)),
		(name) => {
			if (name !== 'usage_limit' || !isOneTimeUse(form.getValues('usage_limit')))
				write(name, OFFERED.find((field) => field.name === name)?.cleared);
		}
	);
	const add = (name: Offered) => {
		presence.add(name);
		if (SWITCHES.includes(name)) write(name, true);
		if (name === 'usage_limit' && isOneTimeUse(values.usage_limit)) write(name, NO_USAGE_LIMIT);
	};
	const labels: Record<Offered, string> = {
		minimum_amount: t('coupons.minimum_spend'),
		maximum_amount: t('coupons.maximum_spend'),
		usage_limit: t('coupons.total_uses'),
		usage_limit_per_user: t('coupons.uses_per_customer'),
		limit_usage_to_x_items: t('coupons.max_discounted_items'),
		individual_use: t('coupons.cannot_be_combined'),
		free_shipping: t('coupons.grants_free_shipping'),
		description: t('coupons.internal_note'),
	};
	const removeVerb = (name: Offered) => (
		<PropertyVerb testID={`coupon-remove-${name}`} onPress={() => presence.withdraw(name)}>
			{t('common.remove')}
		</PropertyVerb>
	);
	const money = (name: 'minimum_amount' | 'maximum_amount', placeholder: string) => (
		<FormField
			control={form.control}
			name={name}
			render={({ field }) => (
				<FormInput
					customComponent={CurrencyInput}
					placeholder={placeholder}
					{...field}
					value={field.value ?? ''}
					onChange={field.onChange}
				/>
			)}
		/>
	);
	const limit = (name: Limit, placeholder: string) => (
		<FormField
			control={form.control}
			name={name}
			render={({ field }) => (
				<FormInput
					placeholder={placeholder}
					keyboardType="number-pad"
					{...field}
					value={fromUsageLimit(field.value)}
					onChange={(text) => field.onChange(toUsageLimit(text))}
				/>
			)}
		/>
	);
	const toggle = (name: 'individual_use' | 'free_shipping') => (
		<FormField
			control={form.control}
			name={name}
			render={({ field }) => <FormSwitch testID={`coupon-${name}`} {...field} />}
		/>
	);
	const offeredValue: Record<Offered, React.ReactNode> = {
		minimum_amount: money('minimum_amount', t('coupons.no_minimum')),
		maximum_amount: money('maximum_amount', t('coupons.no_maximum')),
		usage_limit: limit('usage_limit', t('coupons.unlimited')),
		usage_limit_per_user: limit('usage_limit_per_user', t('coupons.unlimited')),
		limit_usage_to_x_items: limit('limit_usage_to_x_items', t('coupons.all_eligible_items')),
		individual_use: <Help>{t('coupons.cannot_be_combined_help')}</Help>,
		free_shipping: null,
		description: (
			<FormField
				control={form.control}
				name="description"
				render={({ field }) => (
					<FormInput
						description={t('coupons.internal_note_help')}
						{...field}
						value={field.value ?? ''}
						multiline
					/>
				)}
			/>
		),
	};

	return (
		<Form {...form}>
			<DialogBody contentContainerClassName="gap-4">
				<FormErrors />
				<PropertyList prefix="coupon">
					<PropertyRow
						id="code"
						label={t('coupons.code')}
						verb={
							<PropertyVerb
								testID="coupon-generate-code"
								onPress={() => write('code', generateCouponCode())}
							>
								{t('coupons.generate')}
							</PropertyVerb>
						}
					>
						<FormField
							control={form.control}
							name="code"
							render={({ field }) => <FormInput testID="coupon-code" {...field} />}
						/>
					</PropertyRow>
					<PropertyRow id="discount" name="discount_type" label={t('coupons.discount')} align="top">
						<VStack className="gap-2">
							<FormField
								control={form.control}
								name="discount_type"
								render={({ field }) => (
									<FormSegmentedControl
										testID="coupon-discount-type"
										segments={[
											{ value: 'percent', label: t('coupons.percent_short') },
											{ value: 'fixed_cart', label: t('coupons.amount_off_order') },
											{ value: 'fixed_product', label: t('coupons.amount_off_products') },
										]}
										{...field}
										onChange={(value) => {
											field.onChange(value);
											if (value === 'fixed_cart') presence.withdraw('limit_usage_to_x_items');
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
						</VStack>
					</PropertyRow>
					<PropertyRow id="expires" name="date_expires_gmt" label={t('coupons.expires')}>
						<FormField
							control={form.control}
							name="date_expires_gmt"
							render={({ field }) => (
								<>
									<ExpiryPresetChips value={field.value} onChange={field.onChange} />
									<FormMessage />
								</>
							)}
						/>
					</PropertyRow>
					<PropertyRow
						id="one_time_use"
						name="usage_limit"
						label={t('coupons.one_time_use')}
						control={
							<FormField
								control={form.control}
								name="usage_limit"
								render={({ field }) => (
									<FormSwitch
										{...field}
										testID="coupon-one-time-use"
										value={isOneTimeUse(field.value)}
										onChange={(checked: boolean) => {
											field.onChange(toggleOneTimeUse(checked));
											if (checked) presence.withdraw('usage_limit');
										}}
									/>
								)}
							/>
						}
					>
						<Help>{t('coupons.one_time_use_help')}</Help>
					</PropertyRow>
					<PropertyRow id="status" label={t('coupons.status')}>
						<FormField
							control={form.control}
							name="status"
							render={({ field: { value, onChange, ...rest } }) => (
								<FormSelect
									customComponent={StatusSelect}
									value={value as string}
									onChange={onChange}
									{...rest}
								/>
							)}
						/>
					</PropertyRow>
					{presence.present.map((name) => (
						<PropertyRow
							key={name}
							id={name}
							label={labels[name]}
							align={name === 'description' ? 'top' : undefined}
							control={SWITCHES.includes(name) && toggle(name as 'individual_use')}
							verb={removeVerb(name)}
						>
							{offeredValue[name]}
						</PropertyRow>
					))}
					<MetaDataForm testID="coupon" />
					<PropertyAddRow>
						{presence.offered.map((name) => (
							<PropertyAdd
								key={name}
								testID={`coupon-add-${name}`}
								label={labels[name]}
								onPress={() => add(name)}
							/>
						))}
						<PropertyAdd
							testID="coupon-add-meta_data"
							label={t('common.custom_field')}
							onPress={() =>
								write('meta_data', [...(form.getValues('meta_data') ?? []), META_DATA_DEFAULT_ROW])
							}
						/>
					</PropertyAddRow>
				</PropertyList>
			</DialogBody>
			<DialogFooter {...footer} />
		</Form>
	);
}

function Help({ children }: { children: string }) {
	return <Text className="text-muted-foreground text-sm">{children}</Text>;
}
