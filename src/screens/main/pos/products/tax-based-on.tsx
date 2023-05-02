import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Popover from '@wcpos/components/src/popover';
import Pressable from '@wcpos/components/src/pressable';
import Text from '@wcpos/components/src/text';

import DisplayCurrentTaxRates from './display-current-tax-rates';
import useLocalData from '../../../../contexts/local-data';
import { t } from '../../../../lib/translations';
import { TaxRateProvider } from '../../contexts/tax-rates';
import useCurrentOrder from '../contexts/current-order';

const TaxBasedOn = () => {
	const { store } = useLocalData();
	const { currentOrder } = useCurrentOrder();
	const taxBasedOn = useObservableState(store.tax_based_on$, store?.tax_based_on);
	const storeCity = useObservableState(store.store_city$, store?.store_city);
	const storeCountry = useObservableState(store.default_country$, store?.default_country);
	const storePostcode = useObservableState(store.store_postcode$, store?.store_postcode);
	const billing = useObservableState(currentOrder.billing$, currentOrder?.billing);
	const shipping = useObservableState(currentOrder.shipping$, currentOrder?.shipping);
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
		<Popover opened={opened} onClose={() => setOpened(false)} placement="top-start">
			<Popover.Target>
				<Pressable onPress={() => setOpened(true)}>
					<Text size="small">
						{t('Tax based on', { _tags: 'core' })}: {taxBasedOnLabel}
					</Text>
				</Pressable>
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
