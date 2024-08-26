import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation } from '@react-navigation/native';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/components/src/button';
import { Form, FormField, FormInput, FormSelect } from '@wcpos/components/src/form';
import { cn } from '@wcpos/components/src/lib/utils';
import {
	SelectTrigger,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectValue,
} from '@wcpos/components/src/select';
import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';

import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { InclExclRadioGroup } from '../components/incl-excl-tax-radio-group';
import { TaxClassSelect } from '../components/tax-class-select';
import { TaxDisplayRadioGroup } from '../components/tax-display-radio-group';
import { YesNoRadioGroup } from '../components/yes-no-radio-group';

/**
 *
 */
export const TaxSettings = () => {
	const { store } = useAppState();
	const t = useT();
	const navigation = useNavigation();

	/**
	 *
	 */
	const formSchema = React.useMemo(
		() =>
			z.object({
				calc_taxes: z.enum(['yes', 'no']),
				prices_include_tax: z.enum(['yes', 'no']),
				tax_based_on: z.enum(['shipping', 'billing', 'base']).default('base'),
				shipping_tax_class: z.string(),
				tax_round_at_subtotal: z.enum(['yes', 'no']),
				tax_display_shop: z.enum(['incl', 'excl']).default('excl'),
				tax_display_cart: z.enum(['incl', 'excl']).default('excl'),
				price_display_suffix: z.string().optional(),
				tax_total_display: z.enum(['single', 'itemized']).default('itemized'),
			}),
		[]
	);

	/**
	 *
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			calc_taxes: store.calc_taxes,
			prices_include_tax: store.prices_include_tax,
			tax_based_on: store.tax_based_on,
			shipping_tax_class: store.shipping_tax_class,
			tax_round_at_subtotal: store.tax_round_at_subtotal,
			tax_display_shop: store.tax_display_shop,
			tax_display_cart: store.tax_display_cart,
			price_display_suffix: store.price_display_suffix,
			tax_total_display: store.tax_total_display,
		},
	});

	/**
	 *
	 */
	return (
		<VStack>
			<View className="flex-row">
				<Button onPress={() => navigation.navigate('TaxRates')}>
					<ButtonText>{t('View all tax rates', { _tags: 'core' })}</ButtonText>
				</Button>
			</View>
			<Form {...form}>
				<View className="grid grid-cols-2 gap-4">
					<FormField
						control={form.control}
						name="calc_taxes"
						render={({ field }) => (
							<YesNoRadioGroup
								label={t('Enable taxes', { _tags: 'core' })}
								form={form}
								field={field}
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="prices_include_tax"
						render={({ field }) => (
							<YesNoRadioGroup
								label={t('Prices entered with tax', { _tags: 'core' })}
								form={form}
								field={field}
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="tax_based_on"
						render={({ field }) => (
							<FormSelect label={t('Calculate tax based on', { _tags: 'core' })} {...field}>
								<SelectTrigger>
									<SelectValue
										className={cn(
											'text-sm native:text-lg',
											field.value ? 'text-foreground' : 'text-muted-foreground'
										)}
										placeholder={t('Select tax based on', { _tags: 'core' })}
									/>
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{[
											{
												value: 'shipping',
												label: t('Customer shipping address', { _tags: 'core' }),
											},
											{ value: 'billing', label: t('Customer billing address', { _tags: 'core' }) },
											{ value: 'base', label: t('Shop base address', { _tags: 'core' }) },
										].map((position) => (
											<SelectItem
												key={position.value}
												label={position.label}
												value={position.value}
											>
												<Text>{position.label}</Text>
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</FormSelect>
						)}
					/>
					<FormField
						control={form.control}
						name="shipping_tax_class"
						render={({ field }) => (
							<TaxClassSelect field={field} label={t('Shipping tax class', { _tags: 'core' })} />
						)}
					/>
					<FormField
						control={form.control}
						name="tax_total_display"
						render={({ field }) => (
							<TaxDisplayRadioGroup
								label={t('Display tax totals', { _tags: 'core' })}
								form={form}
								field={field}
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="tax_round_at_subtotal"
						render={({ field }) => (
							<YesNoRadioGroup
								label={t('Round tax at subtotal level', { _tags: 'core' })}
								form={form}
								field={field}
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="tax_display_shop"
						render={({ field }) => (
							<InclExclRadioGroup
								label={t('Display prices in the shop', { _tags: 'core' })}
								form={form}
								field={field}
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="tax_display_cart"
						render={({ field }) => (
							<InclExclRadioGroup
								label={t('Display prices during cart and checkout', { _tags: 'core' })}
								form={form}
								field={field}
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="price_display_suffix"
						render={({ field }) => (
							<FormInput label={t('Price display suffix', { _tags: 'core' })} {...field} />
						)}
					/>
				</View>
			</Form>
		</VStack>
	);
};
