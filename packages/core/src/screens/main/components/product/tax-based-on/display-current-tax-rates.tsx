import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { type Href, useRouter } from 'expo-router';

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
	countryDisplayName,
	derivationFailure,
	noRateCause,
	postalLine,
	type RateWhy,
} from './tax-derivation';
import { CountriesProvider, useCountries } from '../../../../../contexts/countries';
import { useT } from '../../../../../contexts/translations';
import { usePercentFormat } from '../../../hooks/use-percent-format';

import type { TaxBasedOn, TaxLocation, TaxRateData } from '../../../contexts/tax-rates';

/**
 * Everything from the tax, cart and order providers arrives as props: on native this renders
 * at the root PortalHost, outside those providers (see `TaxBasedOn`).
 */
export interface DisplayCurrentTaxRatesProps {
	rates: TaxRateData[];
	/** Every rate the store has, to say whether a no-match is the country or this address. */
	allRates: TaxRateData[];
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
	allRates,
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
	// The lookup normalises case and decodes; the field strip keeps the code as stored.
	const countryName = countryDisplayName(countries, location.country);
	const percent = usePercentFormat();

	const failure = derivationFailure(location, isOrderAddress, rates.length);
	const ledgers = React.useMemo(
		() => classLedgers(rates, taxClasses ?? [], location, config),
		[rates, taxClasses, location, config]
	);

	// The popover (a sheet on a phone) would otherwise stay open over where we go.
	const go = (href: Href) => {
		onOpenChange(false);
		router.push(href);
	};
	// The panel's route sits outside the tax and order providers, so the ADDRESS travels with the
	// push and the panel matches its own current rates against it (a sync there re-evaluates the
	// marks). An order with no address has nothing to match: the plain panel.
	const viewAll: Href =
		failure === 'address'
			? '/(app)/(modals)/tax-rates'
			: {
					pathname: '/(app)/(modals)/tax-rates',
					params: {
						applies: '1',
						country: location.country,
						state: location.state,
						city: location.city,
						postcode: location.postcode,
					},
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

	// One scroll container: the rail scrolls inside whatever height the sheet or popover leaves,
	// and the hairline and View-all row sit outside it, so a long US ledger on a short handset
	// (or landscape) never pushes the escape off a phone's sheet, which has no scroll of its own.
	// No fixed height: the anchored popover still sizes to its content.
	return (
		<View className="max-h-full p-2">
			<ScrollView className="min-h-0 shrink">
				<Derivation>
					<DerivationStep label={t('common.calculated_from')} title={source}>
						{/* Text that behaves as a button (CODING_STANDARDS § Buttons, `link`), the shared
					    Button so the raw-Pressable ratchet and the 36 px target both hold. */}
						<Button
							variant="link"
							size="sm"
							role="link"
							testID="tax-based-on-change-setting"
							className="self-start px-0"
							onPress={() => go('/settings/tax')}
						>
							<ButtonText>{t('common.change_in_settings_tax')}</ButtonText>
						</Button>
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
								{
									'no-country': t('common.store_has_no_tax_rate_for_this_address'),
									'not-covered': t('common.no_rate_covers_this_address_in', {
										country: countryName,
									}),
									'no-rate-for-country': t('common.store_has_no_tax_rate_for', {
										country: countryName,
									}),
								}[noRateCause(allRates, location)]
							}
							detail={t('common.add_one_in_woocommerce_tax')}
						/>
					) : (
						<DerivationStep state="result" label={t('common.rates_that_match_it')}>
							<View className="mt-2">
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
												percent={percent(rate.rate ?? '0')}
											/>
										))}
									</React.Fragment>
								))}
							</View>
						</DerivationStep>
					)}
				</Derivation>
			</ScrollView>
			<View className="border-border mt-1 border-t pt-1">
				<Button
					variant="ghost"
					testID="tax-based-on-view-all"
					className="w-full px-2"
					onPress={() => go(viewAll)}
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
		<View className="mt-2 flex-row gap-3">
			{fields.map(([label, value]) => (
				<View key={label} className="min-w-0 flex-1">
					<Text className={TABLE_HEAD_TEXT} numberOfLines={1}>
						{label}
					</Text>
					<Text
						className={value ? 'text-base' : 'text-muted-foreground text-base'}
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
