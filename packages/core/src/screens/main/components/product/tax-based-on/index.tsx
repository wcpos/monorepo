import * as React from 'react';

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@wcpos/components/hover-card';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';

import { DisplayCurrentTaxRates } from './display-current-tax-rates';
import { useT } from '../../../../../contexts/translations';
import { useTaxRates } from '../../../contexts/tax-rates';

/**
 *
 */
export const TaxBasedOn = () => {
	const { rates, taxBasedOn, location } = useTaxRates();
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
	const taxBasedOnLabel = `${t('common.tax_based_on')}: ${taxBasedOnSetting}`;

	return (
		<HoverCard>
			<HoverCardTrigger>
				{rates.length > 0 ? (
					<Text variant="link" className="text-xs">
						{taxBasedOnLabel}
					</Text>
				) : (
					<HStack space="xs">
						<Icon size="sm" variant="error" name="triangleExclamation" />
						<Text variant="link" className="text-error text-xs">
							{taxBasedOnLabel}
						</Text>
					</HStack>
				)}
			</HoverCardTrigger>
			<HoverCardContent side="top" align="start" className="w-96">
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
};
