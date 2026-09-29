import * as React from 'react';
import { View } from 'react-native';

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@wcpos/components/hover-card';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';

import { DisplayCurrentTaxRates } from './display-current-tax-rates';
import { useT } from '../../../../../contexts/translations';
import { useTaxLocation } from '../../../contexts/tax-rates';

/**
 *
 */
export function TaxBasedOn() {
	const { rates, taxBasedOn, location } = useTaxLocation();
	const t = useT();

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

	return (
		<HoverCard>
			<HoverCardTrigger accessibilityLabel={taxBasedOnLabel} testID="tax-based-on-trigger">
				<View className="flex-row items-center gap-1">
					{rates.length > 0 ? (
						<Icon name="percent" size="sm" className="text-muted-foreground" />
					) : (
						<Icon size="sm" variant="error" name="triangleExclamation" />
					)}
					<Text
						className={rates.length > 0 ? 'text-sm' : 'text-destructive text-sm'}
						numberOfLines={1}
					>
						{valueLabel}
					</Text>
					<Icon name="chevronDown" size="sm" className="text-muted-foreground" />
				</View>
			</HoverCardTrigger>
			<HoverCardContent side="top" align="start" className="w-96">
				<Text className="text-sm">{taxBasedOnLabel}</Text>
				<DisplayCurrentTaxRates
					rates={rates}
					country={location.country}
					state={location.state}
					city={location.city}
					postcode={location.postcode}
				/>
			</HoverCardContent>
		</HoverCard>
	);
}
