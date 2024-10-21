import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation } from '@react-navigation/native';
import { useObservablePickState } from 'observable-hooks';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/components/src/button';
import {
	Form,
	FormField,
	FormInput,
	FormSelect,
	FormRadioGroup,
	useFormChangeHandler,
} from '@wcpos/components/src/form';
import { ModalClose, ModalFooter } from '@wcpos/components/src/modal';
import { VStack } from '@wcpos/components/src/vstack';

import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { FormErrors } from '../components/form-errors';
import { InclExclRadioGroup } from '../components/incl-excl-tax-radio-group';
import { TaxBasedOnSelect } from '../components/tax-based-on-select';
import { TaxClassSelect } from '../components/tax-class-select';
import { TaxDisplayRadioGroup } from '../components/tax-display-radio-group';
import { YesNoRadioGroup } from '../components/yes-no-radio-group';
import { useLocalMutation } from '../hooks/mutations/use-local-mutation';
import { useRestHttpClient } from '../hooks/use-rest-http-client';

const formSchema = z.object({
	calc_taxes: z.enum(['yes', 'no']),
	prices_include_tax: z.enum(['yes', 'no']),
	tax_based_on: z.enum(['shipping', 'billing', 'base']).default('base'),
	shipping_tax_class: z.string(),
	tax_round_at_subtotal: z.enum(['yes', 'no']),
	tax_display_shop: z.enum(['incl', 'excl']).default('excl'),
	tax_display_cart: z.enum(['incl', 'excl']).default('excl'),
	price_display_suffix: z.string().optional(),
	tax_total_display: z.enum(['single', 'itemized']).default('itemized'),
});

/**
 *
 */
export const TaxSettings = () => {
	const { store } = useAppState();
	const t = useT();
	const navigation = useNavigation();
	const { localPatch } = useLocalMutation();
	const http = useRestHttpClient();
	const [loading, setLoading] = React.useState(false);

	/**
	 *
	 */
	const formData = useObservablePickState(
		store.$,
		() => {
			const latest = store.getLatest();
			return {
				calc_taxes: latest.calc_taxes,
				prices_include_tax: latest.prices_include_tax,
				tax_based_on: latest.tax_based_on,
				shipping_tax_class: latest.shipping_tax_class,
				tax_round_at_subtotal: latest.tax_round_at_subtotal,
				tax_display_shop: latest.tax_display_shop,
				tax_display_cart: latest.tax_display_cart,
				price_display_suffix: latest.price_display_suffix,
				tax_total_display: latest.tax_total_display,
			};
		},
		'calc_taxes',
		'prices_include_tax',
		'tax_based_on',
		'shipping_tax_class',
		'tax_round_at_subtotal',
		'tax_display_shop',
		'tax_display_cart',
		'price_display_suffix',
		'tax_total_display'
	);

	/**
	 *
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			...formData,
		},
	});

	/**
	 *
	 */
	const handleChange = React.useCallback(
		async (data) => {
			await localPatch({
				document: store,
				data,
			});
		},
		[localPatch, store]
	);

	useFormChangeHandler({ form, onChange: handleChange });

	/**
	 * Track formData changes and reset form
	 */
	React.useEffect(() => {
		form.reset({ ...formData });
	}, [formData, form]);

	/**
	 * Restore server settings
	 */
	const handleRestoreServerSettings = React.useCallback(async () => {
		setLoading(true);
		try {
			const response = await http.get(`stores/${store.id}`);
			const data = response.data;
			await localPatch({
				document: store,
				data: {
					calc_taxes: data.calc_taxes,
					prices_include_tax: data.prices_include_tax,
					tax_based_on: data.tax_based_on,
					shipping_tax_class: data.shipping_tax_class,
					tax_round_at_subtotal: data.tax_round_at_subtotal,
					tax_display_shop: data.tax_display_shop,
					tax_display_cart: data.tax_display_cart,
					price_display_suffix: data.price_display_suffix,
					tax_total_display: data.tax_total_display,
				},
			});
		} catch (error) {
			console.error(error);
		} finally {
			setLoading(false);
		}
	}, [http, localPatch, store]);

	/**
	 *
	 */
	return (
		<VStack>
			<View className="flex-row">
				<Button variant="muted" onPress={() => navigation.navigate('TaxRates')}>
					<ButtonText>{t('View all tax rates', { _tags: 'core' })}</ButtonText>
				</Button>
			</View>
			<Form {...form}>
				<VStack className="gap-4">
					<FormErrors />
					<View className="grid grid-cols-2 gap-4">
						<FormField
							control={form.control}
							name="calc_taxes"
							render={({ field }) => (
								<FormRadioGroup
									customComponent={YesNoRadioGroup}
									label={t('Enable taxes', { _tags: 'core' })}
									{...field}
								/>
							)}
						/>
						<FormField
							control={form.control}
							name="prices_include_tax"
							render={({ field }) => (
								<FormRadioGroup
									customComponent={YesNoRadioGroup}
									label={t('Prices entered with tax', { _tags: 'core' })}
									{...field}
								/>
							)}
						/>
						<FormField
							control={form.control}
							name="tax_based_on"
							render={({ field }) => (
								<FormSelect
									customComponent={TaxBasedOnSelect}
									label={t('Calculate tax based on', { _tags: 'core' })}
									{...field}
								/>
							)}
						/>
						<FormField
							control={form.control}
							name="shipping_tax_class"
							render={({ field }) => (
								<FormSelect
									customComponent={TaxClassSelect}
									label={t('Shipping tax class', { _tags: 'core' })}
									{...field}
								/>
							)}
						/>
						<FormField
							control={form.control}
							name="tax_total_display"
							render={({ field }) => (
								<FormRadioGroup
									customComponent={TaxDisplayRadioGroup}
									label={t('Display tax totals', { _tags: 'core' })}
									{...field}
								/>
							)}
						/>
						<FormField
							control={form.control}
							name="tax_round_at_subtotal"
							render={({ field }) => (
								<FormRadioGroup
									customComponent={YesNoRadioGroup}
									label={t('Round tax at subtotal level', { _tags: 'core' })}
									{...field}
								/>
							)}
						/>
						<FormField
							control={form.control}
							name="tax_display_shop"
							render={({ field }) => (
								<FormRadioGroup
									customComponent={InclExclRadioGroup}
									label={t('Display prices in the shop', { _tags: 'core' })}
									{...field}
								/>
							)}
						/>
						<FormField
							control={form.control}
							name="tax_display_cart"
							render={({ field }) => (
								<FormRadioGroup
									customComponent={InclExclRadioGroup}
									label={t('Display prices during cart and checkout', { _tags: 'core' })}
									{...field}
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
					<ModalFooter className="px-0">
						<Button variant="destructive" onPress={handleRestoreServerSettings} loading={loading}>
							{t('Restore server settings', { _tags: 'core' })}
						</Button>
						<ModalClose>{t('Close', { _tags: 'core' })}</ModalClose>
					</ModalFooter>
				</VStack>
			</Form>
		</VStack>
	);
};
