import * as React from 'react';
import { useWindowDimensions } from 'react-native';

import { ObservableResource } from 'observable-hooks';
import { combineLatest, iif } from 'rxjs';
import { tap, switchMap, map, catchError } from 'rxjs/operators';
import { useTheme } from 'styled-components/native';

import log from '@wcpos/utils/src/logger';

import POSColumns from './columns';
import useCurrentOrder from './contexts/current-order';
import POSTabs from './tabs';
import useAuth from '../../../contexts/auth';
import { TaxesProvider } from '../contexts/taxes';

/**
 * Tax query depends on store.tax_based_on, if customer also depends on currentOrder
 */
const POS = () => {
	const theme = useTheme();
	const dimensions = useWindowDimensions();
	const { store } = useAuth();
	const { currentOrder } = useCurrentOrder();

	const initialQueryResource = React.useMemo(() => {
		const resource$ = store.tax_based_on$.pipe(
			switchMap((taxBasedOn) =>
				iif(
					() => taxBasedOn === 'base',
					combineLatest([store.store_city$, store.default_country$, store.store_postcode$]).pipe(
						map(([city = '', defaultCountry = '', postcode = '']) => {
							/**
							 * default_country has a weird format, eg: US:CA
							 */
							const [country, state] = defaultCountry.split(':');
							return { city, country, state, postcode };
						})
					),
					combineLatest([currentOrder.billing$, currentOrder.shipping$]).pipe(
						map(([billing = {}, shipping = {}]) => {
							if (taxBasedOn === 'billing') {
								return {
									city: billing.city,
									country: billing.country,
									state: billing.state,
									postcode: billing.postcode,
								};
							}
							return {
								city: shipping.city,
								country: shipping.country,
								state: shipping.state,
								postcode: shipping.postcode,
							};
						})
					)
				)
			),
			catchError((err) => {
				log.error(err);
				return err;
			})
		);

		return new ObservableResource(resource$);
	}, [store, currentOrder]);

	return (
		<TaxesProvider initialQueryResource={initialQueryResource}>
			{dimensions.width >= theme.screens.small ? <POSColumns /> : <POSTabs />}
		</TaxesProvider>
	);
};

export default POS;
