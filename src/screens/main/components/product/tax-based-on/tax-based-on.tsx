import * as React from 'react';

import { InlineError } from '@wcpos/components/src/inline-error/inline-error';
import { Button } from '@wcpos/tailwind/src/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@wcpos/tailwind/src/hover-card';
import { Text } from '@wcpos/tailwind/src/text';

import DisplayCurrentTaxRates from './display-current-tax-rates';
import { useT } from '../../../../../contexts/translations';
import { useTaxRates } from '../../../contexts/tax-rates';

/**
 *
 */
const TaxBasedOn = () => {
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
				<Button variant="link" className="">
					{rates.length > 0 ? (
						<Text className="text-sm">{taxBasedOnLabel}</Text>
					) : (
						<InlineError className="text-sm" message={taxBasedOnLabel} />
					)}
				</Button>
			</HoverCardTrigger>
			<HoverCardContent side="top" align="start" className="w-80 native:w-96">
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

export default TaxBasedOn;
