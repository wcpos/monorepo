import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { StackActions, useNavigation } from '@react-navigation/native';
import get from 'lodash/get';
import { useObservableEagerState } from 'observable-hooks';
import { useForm } from 'react-hook-form';
import { isRxDocument } from 'rxdb';
import * as z from 'zod';

import {
	Accordion,
	AccordionContent,
	AccordionTrigger,
	AccordionItem,
} from '@wcpos/components/src/accordian';
import { Button, ButtonText } from '@wcpos/components/src/button';
import {
	Collapsible,
	CollapsibleTrigger,
	CollapsibleContent,
} from '@wcpos/components/src/collapsible';
import { Form, FormField, FormInput, FormSelect, FormSwitch } from '@wcpos/components/src/form';
import { HStack } from '@wcpos/components/src/hstack';
import { Text } from '@wcpos/components/src/text';
import { Toast } from '@wcpos/components/src/toast';
import { VStack } from '@wcpos/components/src/vstack';
import log from '@wcpos/utils/src/logger';

import { useT } from '../../../../contexts/translations';
import { BillingAddressForm, billingAddressSchema } from '../../components/billing-address-form';
import { CountrySelect, StateSelect } from '../../components/country-state-select';
import { CurrencySelect } from '../../components/currency-select';
import { CustomerSelect } from '../../components/customer-select';
import { MetaDataForm } from '../../components/meta-data-form';
import { OrderStatusSelect } from '../../components/order/order-status-select';
import { ShippingAddressForm } from '../../components/shipping-address-form';
import usePushDocument from '../../contexts/use-push-document';

interface Props {
	order: import('@wcpos/database').OrderDocument;
}

/**
 *
 */
export const EditOrderForm = ({ order }: Props) => {
	const pushDocument = usePushDocument();
	const t = useT();
	const navigation = useNavigation();

	if (!order) {
		throw new Error(t('Order not found', { _tags: 'core' }));
	}

	const number = useObservableEagerState(order.number$);
	const billing = useObservableEagerState(order.billing$);
	const shipping = useObservableEagerState(order.shipping$);
	const billingCountry = get(billing, ['country']);
	const shippingCountry = get(shipping, ['country']);

	/**
	 * Handle save button click
	 */
	const handleSave = React.useCallback(
		async (data) => {
			try {
				console.log('data', data);
				// const success = await pushDocument(order);
				// if (isRxDocument(success)) {
				// 	Toast.show({
				// 		text1: t('Order {id} saved', { _tags: 'core', id: success.id }),
				// 		type: 'success',
				// 	});
				// }
			} catch (error) {
				log.error(error);
			} finally {
				//
			}
		},
		[order, pushDocument, t]
	);

	/**
	 *
	 */
	// React.useEffect(() => {
	// 	setPrimaryAction({
	// 		label: t('Save to Server', { _tags: 'core' }),
	// 		action: handleSave,
	// 	});
	// }, [handleSave, setPrimaryAction, t]);

	/**
	 *
	 */
	const formSchema = React.useMemo(
		() =>
			z.object({
				status: z.string(),
				number: z.string().optional(),
				parent_id: z.number().optional(),
				currency: z.string().optional(),
				currency_symbol: z.string().optional(),
				date_created_gmt: z.string().optional(),
				customer_id: z.number().default(0),
				customer_note: z.string().optional(),
				billing: billingAddressSchema,
				shipping: z.object({
					first_name: z.string().optional(),
					last_name: z.string().optional(),
					company: z.string().optional(),
					address_1: z.string().optional(),
					address_2: z.string().optional(),
					city: z.string().optional(),
					state: z.string().optional(),
					postcode: z.string().optional(),
					country: z.string().optional(),
				}),
				payment_method: z.string().optional(),
				payment_method_title: z.string().optional(),
				transaction_id: z.string().optional(),
				date_paid_gmt: z.string().optional(),
				date_completed_gmt: z.string().optional(),
				meta_data: z.array(z.object({ key: z.string(), value: z.any() })).optional(),
			}),
		[]
	);

	/**
	 *
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			status: order.status,
			number,
			parent_id: order.parent_id,
			currency: order.currency,
			currency_symbol: order.currency_symbol,
			date_created_gmt: order.date_created_gmt,
			customer_id: order.customer_id,
			customer_note: order.customer_note,
			billing: {
				first_name: billing?.first_name,
				last_name: billing?.last_name,
				company: billing?.company,
				address_1: billing?.address_1,
				address_2: billing?.address_2,
				city: billing?.city,
				state: billing?.state,
				postcode: billing?.postcode,
				country: billingCountry,
				email: billing?.email,
				phone: billing?.phone,
			},
			shipping: {
				first_name: shipping?.first_name,
				last_name: shipping?.last_name,
				company: shipping?.company,
				address_1: shipping?.address_1,
				address_2: shipping?.address_2,
				city: shipping?.city,
				state: shipping?.state,
				postcode: shipping?.postcode,
				country: shippingCountry,
			},
			payment_method: order.payment_method,
			payment_method_title: order.payment_method_title,
			transaction_id: order.transaction_id,
			date_paid_gmt: order.date_paid_gmt,
			date_completed_gmt: order.date_completed_gmt,
			meta_data: order.meta_data,
		},
	});

	console.log('form', form.formState);

	/**
	 *
	 */
	return (
		<Form {...form}>
			<VStack className="gap-4">
				<View className="grid grid-cols-3 gap-4">
					<FormField
						control={form.control}
						name="status"
						render={({ field }) => (
							<FormSelect
								label={t('Status', { _tags: 'core' })}
								customComponent={OrderStatusSelect}
								{...field}
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="number"
						render={({ field }) => (
							<FormInput label={t('Order Number', { _tags: 'core' })} {...field} />
						)}
					/>
					<FormField
						control={form.control}
						name="parent_id"
						render={({ field }) => (
							<FormInput label={t('Parent ID', { _tags: 'core' })} {...field} />
						)}
					/>
					<FormField
						control={form.control}
						name="currency"
						render={({ field }) => (
							<FormSelect
								customComponent={CurrencySelect}
								label={t('Currency', { _tags: 'core' })}
								{...field}
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="currency_symbol"
						render={({ field }) => (
							<FormInput label={t('Currency Symbol', { _tags: 'core' })} {...field} />
						)}
					/>
					<FormField
						control={form.control}
						name="date_created_gmt"
						render={({ field }) => (
							<FormInput label={t('Date Created', { _tags: 'core' })} {...field} />
						)}
					/>
					<FormField
						control={form.control}
						name="customer_id"
						render={({ field }) => (
							<FormSelect
								customComponent={CustomerSelect}
								label={t('Customer', { _tags: 'core' })}
								{...field}
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="customer_note"
						render={({ field }) => (
							<FormInput label={t('Customer Note', { _tags: 'core' })} {...field} />
						)}
					/>
					<View className="col-span-3">
						<Collapsible>
							<CollapsibleTrigger>
								<Text>{t('Billing Address', { _tags: 'core' })}</Text>
							</CollapsibleTrigger>
							<CollapsibleContent>
								<BillingAddressForm />
							</CollapsibleContent>
						</Collapsible>
					</View>
					<View className="col-span-3">
						<Collapsible>
							<CollapsibleTrigger>
								<Text>{t('Shipping Address', { _tags: 'core' })}</Text>
							</CollapsibleTrigger>
							<CollapsibleContent>
								<ShippingAddressForm />
							</CollapsibleContent>
						</Collapsible>
					</View>
					<FormField
						control={form.control}
						name="payment_method"
						render={({ field }) => (
							<FormInput label={t('Payment Method ID', { _tags: 'core' })} {...field} />
						)}
					/>
					<FormField
						control={form.control}
						name="payment_method_title"
						render={({ field }) => (
							<FormInput label={t('Payment Method Title', { _tags: 'core' })} {...field} />
						)}
					/>
					<FormField
						control={form.control}
						name="transaction_id"
						render={({ field }) => (
							<FormInput label={t('Transaction ID', { _tags: 'core' })} {...field} />
						)}
					/>
					<FormField
						control={form.control}
						name="date_paid_gmt"
						render={({ field }) => (
							<FormInput label={t('Date Paid', { _tags: 'core' })} {...field} />
						)}
					/>
					<FormField
						control={form.control}
						name="date_completed_gmt"
						render={({ field }) => (
							<FormInput label={t('Date Completed', { _tags: 'core' })} {...field} />
						)}
					/>
					<View className="col-span-3">
						<MetaDataForm name="meta_data" />
					</View>
				</View>
				<HStack className="justify-end">
					<Button variant="muted" onPress={() => navigation.dispatch(StackActions.pop(1))}>
						<ButtonText>{t('Cancel', { _tags: 'core' })}</ButtonText>
					</Button>
					<Button onPress={form.handleSubmit(handleSave)}>
						<ButtonText>{t('Save to Server', { _tags: 'core' })}</ButtonText>
					</Button>
				</HStack>
			</VStack>
		</Form>
	);
};
