import * as React from 'react';
import { View } from 'react-native';

import { Icon } from '@wcpos/components/icon';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/popover';
import { Text } from '@wcpos/components/text';
import { useDocField } from '@wcpos/query';

import { DisplayCurrentTaxRates } from './display-current-tax-rates';
import { useT } from '../../../../../contexts/translations';
import { useExtraData } from '../../../contexts/extra-data';
import { useTaxLocation, useTaxSettings } from '../../../contexts/tax-rates';
import { useCartConfig } from '../../../pos/hooks/use-cart-config';

/**
 *
 */
export function TaxBasedOn() {
	// `hasOrder` is false on the standalone Products screen: there the address is the shop base
	// whatever the setting says (`orderTaxLocation`).
	const { rates, taxBasedOn, location, addressUsed, hasOrder } = useTaxLocation();
	const { allRates } = useTaxSettings();
	const t = useT();
	/**
	 * Everything the panel reads from the tax, cart and order providers is read HERE and passed
	 * down: on native the popover's content renders at the app's root PortalHost, outside those
	 * providers (the portal re-provides only the popover's own context), so a hook inside the
	 * panel would throw. Web keeps context
	 * through Radix, which is why only a device shows it.
	 */
	const config = useCartConfig();
	const { extraData } = useExtraData();
	const taxClasses = useDocField(extraData, (value) => value.taxClasses) as
		{ slug: string; name: string }[] | undefined;

	/**
	 *
	 */
	let taxBasedOnSetting = t('common.shop_base_address');
	if (taxBasedOn === 'billing') {
		taxBasedOnSetting = t('common.customer_billing_address');
	}
	if (taxBasedOn === 'shipping') {
		taxBasedOnSetting = t('common.customer_shipping_address');
	}
	const valueLabel =
		taxBasedOn === 'billing' || taxBasedOn === 'shipping'
			? taxBasedOnSetting
			: t('common.shop_base');
	const taxBasedOnLabel = `${t('common.tax_based_on')}: ${taxBasedOnSetting}`;

	// A popover, not a hover card: the chevron promises a press, a touch screen has no hover
	// (Radix's hover card ignores touch), and a hover card opened under a resting pointer
	// covered the first product tiles and stayed open while the pointer crossed it.
	return (
		<Popover>
			<PopoverTrigger accessibilityLabel={taxBasedOnLabel} testID="tax-based-on-trigger">
				<View className="flex-row items-center gap-1">
					{rates.length > 0 ? (
						<Icon name="percent" size="sm" className="text-muted-foreground" />
					) : (
						<Icon size="sm" variant="error" name="triangleExclamation" />
					)}
					<Text
						className={rates.length > 0 ? 'shrink text-sm' : 'text-destructive shrink text-sm'}
						numberOfLines={1}
					>
						{valueLabel}
					</Text>
					<Icon name="chevronDown" size="sm" className="text-muted-foreground" />
				</View>
			</PopoverTrigger>
			<PopoverContent side="top" align="start" className="w-96" testID="tax-based-on-content">
				<DisplayCurrentTaxRates
					rates={rates}
					allRates={allRates}
					taxBasedOn={taxBasedOn}
					location={location}
					addressUsed={addressUsed}
					hasOrder={hasOrder}
					config={config}
					taxClasses={taxClasses}
				/>
			</PopoverContent>
		</Popover>
	);
}
