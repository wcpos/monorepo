import * as React from 'react';

import { Button } from '@wcpos/tailwind/src/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@wcpos/tailwind/src/hover-card';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { Icon } from '@wcpos/tailwind/src/icon';
import { Text } from '@wcpos/tailwind/src/text';

import DisplayCurrentTaxRates from './display-current-tax-rates';
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
				<Button variant="link">
					{rates.length > 0 ? (
						<Text className="text-sm">{taxBasedOnLabel}</Text>
					) : (
						<HStack space="xs">
							<Icon name="triangleExclamation" className="fill-destructive" />
							<Text className="text-sm text-destructive">{taxBasedOnLabel}</Text>
						</HStack>
					)}
				</Button>
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
