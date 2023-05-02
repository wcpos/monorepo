import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Popover from '@wcpos/components/src/popover';
import Text from '@wcpos/components/src/text';

import DisplayCurrentTaxRates from './display-current-tax-rates';
import useLocalData from '../../../../../contexts/local-data';
import { t } from '../../../../../lib/translations';
import { TaxRateProvider } from '../../../contexts/tax-rates';

interface TaxBasedOnProps {
	taxBasedOn: import('@wcpos/database').StoreDocument['tax_based_on'];
	billing?: import('@wcpos/database').OrderDocument['billing'];
	shipping?: import('@wcpos/database').OrderDocument['shipping'];
}

/**
 *
 */
const TaxBasedOn = ({ taxBasedOn, billing, shipping }: TaxBasedOnProps) => {
	const { store } = useLocalData();
	const storeCity = useObservableState(store.store_city$, store?.store_city);
	const storeCountry = useObservableState(store.default_country$, store?.default_country);
	const storePostcode = useObservableState(store.store_postcode$, store?.store_postcode);
	const [opened, setOpened] = React.useState(false);

	/**
	 *
	 */
	let taxBasedOnLabel = t('Shop base address', { _tags: 'core' });
	if (taxBasedOn === 'billing') {
		taxBasedOnLabel = t('Customer billing address', { _tags: 'core' });
	}
	if (taxBasedOn === 'shipping') {
		taxBasedOnLabel = t('Customer shipping address', { _tags: 'core' });
	}

	/**
	 *
	 */
	const initialQuery = React.useMemo(() => {
		if (taxBasedOn === 'base') {
			/**
			 * default_country has a weird format, eg: US:CA
			 */
			const [country, state] = (storeCountry || '').split(':');
			return {
				city: storeCity,
				country,
				state,
				postcode: storePostcode,
			};
		}
		if (taxBasedOn === 'billing') {
			return {
				city: billing?.city,
				country: billing?.country,
				state: billing?.state,
				postcode: billing?.postcode,
			};
		}
		return {
			city: shipping?.city,
			country: shipping?.country,
			state: shipping?.state,
			postcode: shipping?.postcode,
		};
	}, [
		taxBasedOn,
		shipping?.city,
		shipping?.country,
		shipping?.state,
		shipping?.postcode,
		storeCountry,
		storeCity,
		storePostcode,
		billing?.city,
		billing?.country,
		billing?.state,
		billing?.postcode,
	]);

	return (
		<Popover
			opened={opened}
			onClose={() => setOpened(false)}
			onOpen={() => setOpened(true)}
			placement="top-start"
		>
			<Popover.Target>
				<Text size="small">
					{t('Tax based on', { _tags: 'core' })}: {taxBasedOnLabel}
				</Text>
			</Popover.Target>
			<Popover.Content>
				<TaxRateProvider initialQuery={initialQuery}>
					<DisplayCurrentTaxRates />
				</TaxRateProvider>
			</Popover.Content>
		</Popover>
	);
};

export default TaxBasedOn;
