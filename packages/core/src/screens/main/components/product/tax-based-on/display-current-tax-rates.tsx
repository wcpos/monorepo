import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { useRouter } from 'expo-router';

import { Button, ButtonText } from '@wcpos/components/button';
import { Derivation, DerivationStep } from '@wcpos/components/derivation';
import { Icon } from '@wcpos/components/icon';
import { cn } from '@wcpos/components/lib/utils';
import { useRootContext } from '@wcpos/components/popover';
import { TABLE_HEAD_TEXT } from '@wcpos/components/table';
import { Text } from '@wcpos/components/text';
import type { CartConfig } from '@wcpos/order-math';

import {
	classLedgers,
	derivationFailure,
	postalLine,
	type RateWhy,
	roundPercent,
} from './tax-derivation';
import { CountriesProvider, useCountries } from '../../../../../contexts/countries';
import { useT } from '../../../../../contexts/translations';
import { type NumberFormatOptions, useNumberFormat } from '../../../hooks/use-number-format';

import type { TaxBasedOn, TaxLocation, TaxRateData } from '../../../contexts/tax-rates';

/** Up to the four places WooCommerce stores a rate in; a module constant so `format` is stable. */
const PERCENT_FORMAT: NumberFormatOptions = { decimalScale: 4 };

/**
 * Everything from the tax, cart and order providers arrives as props: on native this renders
 * at the root PortalHost, outside those providers (see `TaxBasedOn`).
 */
export interface DisplayCurrentTaxRatesProps {
	rates: TaxRateData[];
	taxBasedOn: TaxBasedOn;
	location: TaxLocation;
	/** False on the standalone Products screen, where the address is the shop base. */
	hasOrder: boolean;
	config: CartConfig;
	/** `extraData.taxClasses`: the store's class order and names. */
	taxClasses?: readonly { slug: string; name: string }[];
}

/**
 * The "Tax based on" panel: the setting, the address it picks, and the rates that address
 * matched, in the order the tax engine uses them (board: tax-based-on-popover-2026-10-18).
 */
export function DisplayCurrentTaxRates(props: DisplayCurrentTaxRatesProps) {
	return (
		<CountriesProvider>
			<TaxDerivation {...props} />
		</CountriesProvider>
	);
}

function TaxDerivation({
	rates,
	taxBasedOn,
	location,
	hasOrder,
	config,
	taxClasses,
}: DisplayCurrentTaxRatesProps) {
	const t = useT();
	const router = useRouter();
	const { onOpenChange } = useRootContext();
	// Without an order the address is the shop base whatever the setting says
	// (`orderTaxLocation`), so it is labelled and judged as the shop's.
	const isOrderAddress = hasOrder && taxBasedOn !== 'base';
	const countries = useCountries();
	const countryName =
		countries.find((country) => country.code === location.country)?.name ?? location.country;
	const { format } = useNumberFormat(PERCENT_FORMAT);
	const percent = (value: number) => `${format(roundPercent(value))}%`;

	const failure = derivationFailure(location, isOrderAddress, rates.length);
	const ledgers = React.useMemo(
		() => classLedgers(rates, taxClasses ?? [], location, config),
		[rates, taxClasses, location, config]
	);

	// The popover (a sheet on a phone) would otherwise stay open over where we go.
	const go = (href: '/(app)/(drawer)/settings/tax' | '/(app)/(modals)/tax-rates') => {
		onOpenChange(false);
		router.push(href);
	};

	const why = (reason: RateWhy) => {
		switch (reason.field) {
			case 'postcode':
				return t('common.tax_why_postcode', { pattern: reason.pattern });
			case 'city':
				return t('common.tax_why_city');
			case 'state':
				return t('common.tax_why_state');
			case 'country':
				return t('common.tax_why_anywhere_in', { country: reason.country });
			default:
				return t('common.tax_why_anywhere');
		}
	};

	let source = t('common.shop_base_address');
	if (taxBasedOn === 'billing') source = t('common.customer_billing_address');
	if (taxBasedOn === 'shipping') source = t('common.customer_shipping_address');

	return (
		<View className="p-2">
			<Derivation>
				<DerivationStep label={t('common.calculated_from')} title={source}>
					{/* Text that behaves as a button (CODING_STANDARDS § Buttons, `link`): inline under
					    the title, no control box, so it sits where the board puts it. */}
					{/* The slop gives the finger its 44 round a 20-tall line (§ Design 2). */}
					<Pressable
						role="link"
						testID="tax-based-on-change-setting"
						className="mt-0.5 self-start"
						hitSlop={{ top: 12, bottom: 12 }}
						onPress={() => go('/(app)/(drawer)/settings/tax')}
					>
						<Text variant="link" className="text-primary text-sm">
							{t('common.change_in_settings_tax')}
						</Text>
					</Pressable>
				</DerivationStep>
				{failure === 'address' ? (
					<DerivationStep
						state="failed"
						label={t('common.no_address_on_the_order')}
						title={
							taxBasedOn === 'billing'
								? t('common.order_has_no_billing_address')
								: t('common.order_has_no_shipping_address')
						}
						detail={t('common.add_a_customer_with_an_address')}
					>
						<AddressFields location={location} />
					</DerivationStep>
				) : (
					<DerivationStep
						label={isOrderAddress ? t('common.address_on_the_order') : t('common.shop_address')}
						title={postalLine(location, countryName)}
					>
						<AddressFields location={location} />
					</DerivationStep>
				)}
				{failure === 'address' ? (
					<DerivationStep
						state="quiet"
						label={t('common.rates_that_match_it')}
						detail={t('common.none')}
					/>
				) : failure === 'rates' ? (
					<DerivationStep
						state="failed"
						label={t('common.no_rate_matches_it')}
						title={
							countryName
								? t('common.store_has_no_tax_rate_for', { country: countryName })
								: t('common.store_has_no_tax_rate_for_this_address')
						}
						detail={t('common.add_one_in_woocommerce_tax')}
					/>
				) : (
					<DerivationStep state="result" label={t('common.rates_that_match_it')}>
						{/* About ten rate lines, then it scrolls: a long US ledger must not push the
						    View-all row off a phone's sheet, which has no scroll of its own. */}
						<ScrollView className="mt-1.5 max-h-80">
							{ledgers.map((ledger, index) => (
								<React.Fragment key={ledger.slug}>
									<RateLine
										name={ledger.name}
										percent={percent(ledger.percent)}
										className={index > 0 ? 'mt-1 min-h-8' : 'min-h-8'}
										strong
									/>
									{ledger.rates.map(({ rate, why: reason }) => (
										<RateLine
											key={rate.id}
											name={rate.name ?? ''}
											why={why(reason)}
											percent={percent(parseFloat(rate.rate ?? '0'))}
										/>
									))}
								</React.Fragment>
							))}
						</ScrollView>
					</DerivationStep>
				)}
			</Derivation>
			<View className="border-border mt-1 border-t pt-1">
				<Button
					variant="ghost"
					testID="tax-based-on-view-all"
					className="w-full px-2"
					onPress={() => go('/(app)/(modals)/tax-rates')}
				>
					<View className="w-full flex-row items-center justify-between gap-2">
						<ButtonText>{t('common.view_all_tax_rates')}</ButtonText>
						<Icon name="chevronRight" size="sm" />
					</View>
				</Button>
			</View>
		</View>
	);
}

/** Country · State · City · Postcode as WooCommerce stores them; a dash where it is empty. */
function AddressFields({ location }: { location: TaxLocation }) {
	const t = useT();
	const fields = [
		[t('common.country'), location.country],
		[t('common.state'), location.state],
		[t('common.city'), location.city],
		[t('common.postcode'), location.postcode],
	] as const;
	return (
		<View className="mt-2.5 flex-row gap-3">
			{fields.map(([label, value]) => (
				<View key={label} className="min-w-0 flex-1">
					<Text className={TABLE_HEAD_TEXT} numberOfLines={1}>
						{label}
					</Text>
					<Text
						className={value ? 'mt-px text-base' : 'text-muted-foreground mt-px text-base'}
						numberOfLines={1}
					>
						{value || '—'}
					</Text>
				</View>
			))}
		</View>
	);
}

function RateLine({
	name,
	why,
	percent,
	strong,
	className,
}: {
	name: string;
	why?: string;
	percent: string;
	strong?: boolean;
	className?: string;
}) {
	const tone = strong ? 'font-semibold' : 'text-muted-foreground';
	return (
		<View className={cn('min-h-6 flex-row items-baseline gap-3', className)}>
			<Text className={cn('min-w-0 flex-1 text-base', tone, !strong && 'pl-3')}>
				{/* Merchant-authored in WooCommerce settings, so "VAT &amp; Duty" reaches us encoded. */}
				<Text decodeHtml className={cn('text-base', tone)}>
					{name}
				</Text>
				{why ? <Text className="text-muted-foreground text-base">{` · ${why}`}</Text> : null}
			</Text>
			<Text className={cn('w-16 text-right text-base tabular-nums', tone)}>{percent}</Text>
		</View>
	);
}
