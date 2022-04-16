import * as React from 'react';
import { ObservableResource } from 'observable-hooks';
import { map } from 'rxjs/operators';
import useAppState from '../use-app-state';
import { useTaxRatesReplication } from './use-tax-rates-replication';

type TaxRate = import('@wcpos/database').TaxRateDocument;

/**
 *
 */
export const useTaxRatesResource = (): ObservableResource<TaxRate[]> => {
	const { storeDB } = useAppState();
	useTaxRatesReplication();

	const query = storeDB?.collections.taxes.find();

	return new ObservableResource(query.$);
};
