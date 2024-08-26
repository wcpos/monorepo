import * as React from 'react';

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@wcpos/components/src/hover-card';
import { HStack } from '@wcpos/components/src/hstack';
import { Icon } from '@wcpos/components/src/icon';
import { Text } from '@wcpos/components/src/text';

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
	let taxBasedOnSetting = t('Shop base address', { _tags: 'core' });
	if (taxBasedOn === 'billing') {
		taxBasedOnSetting = t('Customer billing address', { _tags: 'core' });
	}
	if (taxBasedOn === 'shipping') {
		taxBasedOnSetting = t('Customer shipping address', { _tags: 'core' });
	}
	const taxBasedOnLabel = `${t('Tax based on', { _tags: 'core' })}: ${taxBasedOnSetting}`;

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
						<Text variant="link" className="text-xs text-error">
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
