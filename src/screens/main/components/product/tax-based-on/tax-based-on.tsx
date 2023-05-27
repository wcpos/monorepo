import * as React from 'react';

import { useObservableState, useObservableSuspense } from 'observable-hooks';

import { InlineError } from '@wcpos/components/src/inline-error/inline-error';
import Popover from '@wcpos/components/src/popover';
import Text from '@wcpos/components/src/text';

import DisplayCurrentTaxRates from './display-current-tax-rates';
import useLocalData from '../../../../../contexts/local-data';
import { t } from '../../../../../lib/translations';
import useTaxRates from '../../../contexts/tax-rates';

/**
 * NOTE: this must be used within a TaxRatesProvider
 */
const TaxBasedOn = () => {
	const { store } = useLocalData();
	const taxBasedOn = useObservableState(store.tax_based_on$, store?.tax_based_on);
	const [opened, setOpened] = React.useState(false);
	const { resource, query$ } = useTaxRates();
	const rates = useObservableSuspense(resource);
	const query = useObservableState(query$, query$.getValue());
	const { country, state, city, postcode } = query?.location || {};

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
		<Popover
			opened={opened}
			onClose={() => setOpened(false)}
			onOpen={() => setOpened(true)}
			placement="top-start"
		>
			<Popover.Target>
				{Array.isArray(rates) && rates.length > 0 ? (
					<Text size="small">{taxBasedOnLabel}</Text>
				) : (
					<InlineError size="small" message={taxBasedOnLabel} />
				)}
			</Popover.Target>
			<Popover.Content style={{ width: 380 }}>
				<DisplayCurrentTaxRates
					rates={rates}
					country={country}
					state={state}
					city={city}
					postcode={postcode}
					setOpened={setOpened}
				/>
			</Popover.Content>
		</Popover>
	);
};

export default TaxBasedOn;
