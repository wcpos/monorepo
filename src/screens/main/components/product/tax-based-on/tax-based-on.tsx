import * as React from 'react';

import get from 'lodash/get';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { InlineError } from '@wcpos/components/src/inline-error/inline-error';
import Popover from '@wcpos/components/src/popover';
import Text from '@wcpos/components/src/text';

import DisplayCurrentTaxRates from './display-current-tax-rates';
import { useT } from '../../../../../contexts/translations';
import { useTaxRates } from '../../../contexts/tax-rates';

/**
 * NOTE: this must be used within a TaxRatesProvider
 */
const TaxBasedOn = ({ taxBasedOn }) => {
	const [opened, setOpened] = React.useState(false);
	const { taxQuery } = useTaxRates();
	const result = useObservableSuspense(taxQuery.resource);
	const rates = result.hits.map(({ document }) => document);
	const { country, state, city, postcode } = useObservableState(
		taxQuery.params$.pipe(map((params) => get(params, ['search'], {}))),
		get(taxQuery.getParams(), ['search'], {})
	);
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
		<Popover
			opened={opened}
			onClose={() => setOpened(false)}
			onOpen={() => setOpened(true)}
			placement="top-start"
		>
			<Popover.Target>
				{result.count > 0 ? (
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
