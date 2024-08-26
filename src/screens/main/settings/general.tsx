import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useObservableSuspense } from 'observable-hooks';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Form, FormField, FormInput, FormSwitch, FormSelect } from '@wcpos/components/src/form';
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
import { CurrencySelect } from '../components/currency-select';
import { CustomerSelect } from '../components/customer-select';
import { LanguageSelect } from '../components/language-select';
import { useLocalMutation } from '../hooks/mutations/use-local-mutation';
import { useDefaultCustomer } from '../hooks/use-default-customer';

/**
 *
 */
export const GeneralSettings = () => {
	const { store } = useAppState();
	const { defaultCustomerResource } = useDefaultCustomer();
	const defaultCustomer = useObservableSuspense(defaultCustomerResource);
	const t = useT();
	const { localPatch } = useLocalMutation();

	/**
	 *
	 */
	const handleCustomerSelect = React.useCallback(
		(customer) => {
			if (customer.id !== defaultCustomer.id) {
				localPatch({
					document: store,
					data: { default_customer: customer.id },
				});
			}
		},
		[defaultCustomer.id, localPatch, store]
	);

	/**
	 *
	 */
	const formSchema = React.useMemo(
		() =>
			z.object({
				name: z.string().optional(),
				locale: z.string().optional(),
				default_customer: z.string().optional(),
				default_customer_is_cashier: z.boolean().optional(),
				currency: z.string().optional(),
				currency_pos: z.string().optional(),
				price_thousand_sep: z.string().optional(),
				price_decimal_sep: z.string().optional(),
				price_num_decimals: z.number().optional(),
			}),
		[]
	);

	/**
	 *
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: store.name,
			locale: store.locale,
			default_customer: defaultCustomer.id,
			default_customer_is_cashier: store.default_customer_is_cashier,
			currency: store.currency,
			currency_pos: store.currency_pos,
			price_thousand_sep: store.price_thousand_sep,
			price_decimal_sep: store.price_decimal_sep,
			price_num_decimals: store.price_num_decimals,
		},
	});

	/**
	 *
	 */
	return (
		<Form {...form}>
			<View className="grid grid-cols-2 gap-4">
				<View className="col-span-2">
					<FormField
						control={form.control}
						name="name"
						render={({ field }) => (
							<FormInput label={t('Store Name', { _tags: 'core' })} {...field} />
						)}
					/>
				</View>
				<FormField
					control={form.control}
					name="locale"
					render={({ field }) => (
						<LanguageSelect label={t('Language', { _tags: 'core' })} {...field} />
					)}
				/>
				<VStack>
					<FormField
						control={form.control}
						name="default_customer"
						render={({ field }) => (
							<CustomerSelect label={t('Default Customer', { _tags: 'core' })} {...field} />
						)}
					/>
					<FormField
						control={form.control}
						name="default_customer_is_cashier"
						render={({ field }) => (
							<FormSwitch label={t('Default Customer is cashier', { _tags: 'core' })} {...field} />
						)}
					/>
				</VStack>
				<FormField
					control={form.control}
					name="currency"
					render={({ field }) => (
						<CurrencySelect label={t('Currency', { _tags: 'core' })} {...field} />
					)}
				/>
				<FormField
					control={form.control}
					name="currency_pos"
					render={({ field }) => (
						<FormSelect label={t('Currency Position', { _tags: 'core' })} {...field}>
							<SelectTrigger>
								<SelectValue
									className={cn(
										'text-sm native:text-lg',
										field.value ? 'text-foreground' : 'text-muted-foreground'
									)}
									placeholder={t('Select a currency position', { _tags: 'core' })}
								/>
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{[
										{ value: 'left', label: t('Left', { _tags: 'core' }) },
										{ value: 'right', label: t('Right', { _tags: 'core' }) },
										{ value: 'left_space', label: t('Left with space', { _tags: 'core' }) },
										{ value: 'right_space', label: t('Right with space', { _tags: 'core' }) },
									].map((position) => (
										<SelectItem key={position.value} label={position.label} value={position.value}>
											<Text>{position.label}</Text>
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</FormSelect>
					)}
				/>
				<View className="col-span-2 grid grid-cols-3  gap-4">
					<FormField
						control={form.control}
						name="price_thousand_sep"
						render={({ field }) => (
							<FormInput label={t('Thousand Separator', { _tags: 'core' })} {...field} />
						)}
					/>
					<FormField
						control={form.control}
						name="price_decimal_sep"
						render={({ field }) => (
							<FormInput label={t('Decimal Separator', { _tags: 'core' })} {...field} />
						)}
					/>
					<FormField
						control={form.control}
						name="price_num_decimals"
						render={({ field }) => (
							<FormInput label={t('Number of Decimals', { _tags: 'core' })} {...field} />
						)}
					/>
				</View>
			</View>
		</Form>
	);
};
