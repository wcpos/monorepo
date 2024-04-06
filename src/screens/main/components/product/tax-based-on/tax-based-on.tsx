import * as React from 'react';

import { InlineError } from '@wcpos/components/src/inline-error/inline-error';
import Popover from '@wcpos/components/src/popover';
import Text from '@wcpos/components/src/text';

import DisplayCurrentTaxRates from './display-current-tax-rates';
import { useT } from '../../../../../contexts/translations';
import { useTaxRates } from '../../../contexts/tax-rates';

/**
 *
 */
const TaxBasedOn = () => {
	const [opened, setOpened] = React.useState(false);
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
		<Popover
			opened={opened}
			onClose={() => setOpened(false)}
			onOpen={() => setOpened(true)}
			placement="top-start"
		>
			<Popover.Target>
				{rates.length > 0 ? (
					<Text size="small">{taxBasedOnLabel}</Text>
				) : (
					<InlineError size="small" message={taxBasedOnLabel} />
				)}
			</Popover.Target>
			<Popover.Content style={{ width: 380 }}>
				<DisplayCurrentTaxRates
					rates={rates}
					country={location.country}
					state={location.state}
					city={location.city}
					postcode={location.postcode}
					setOpened={setOpened}
				/>
			</Popover.Content>
		</Popover>
	);
};

export default TaxBasedOn;
