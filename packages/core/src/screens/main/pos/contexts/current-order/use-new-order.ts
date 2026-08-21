import { decode } from 'html-entities';
import {
	ObservableResource,
	useObservableEagerState,
	useObservableSuspense,
} from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import useDeepCompareEffect from 'use-deep-compare-effect';

import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { newOrder$, patchTemporaryOrderPayload } from './temporary-order';
import { useAppState } from '../../../../../contexts/app-state';
import allCurrencies from '../../../../../contexts/currencies/currencies.json';
import { useDefaultCustomer } from '../../../hooks/use-default-customer';
import { ensurePosOrderIdentityMeta, transformCustomerJSONToOrderJSON } from '../../hooks/utils';

const newOrderLogger = getLogger(['wcpos', 'pos', 'new-order']);

/**
 * @FIXME: This will subscribe and emit a new order on app load, I should be careful about
 * global subscriptions like this.
 */
const newOrderResource = new ObservableResource(newOrder$);

/**
 * Provides the temporary (engine-shaped) order populated from the current customer and
 * store state. The returned document is the RAW temp record — the current-order provider
 * wraps it for the legacy face; all seeding writes here go through the temp-order
 * repository's payload merge.
 */
export const useNewOrder = () => {
	const { store, wpCredentials } = useAppState();
	const { defaultCustomerResource } = useDefaultCustomer();

	const defaultCustomer = useObservableSuspense(defaultCustomerResource);
	const currency = useObservableEagerState(store.currency$);
	const prices_include_tax = useObservableEagerState(store.prices_include_tax$);
	const tax_based_on = useObservableEagerState(store.tax_based_on$);
	const country = useObservableEagerState(store.store_country$);

	const newOrder = useObservableSuspense(newOrderResource);

	/**
	 *
	 */
	useDeepCompareEffect(() => {
		const customer = isRxDocument(defaultCustomer)
			? defaultCustomer.toMutableJSON()
			: defaultCustomer;
		const baseData = transformCustomerJSONToOrderJSON(
			customer as import('@wcpos/database').CustomerDocument,
			country as string
		);
		const data: Record<string, unknown> = { ...baseData };
		data.currency = currency;
		const currencyData = allCurrencies.find((c) => c.code === currency) ?? { symbol: '' };
		data.currency_symbol = decode(currencyData.symbol || '');
		data.prices_include_tax = prices_include_tax === 'yes';
		data.meta_data = ensurePosOrderIdentityMeta(undefined, {
			userId: wpCredentials.id,
			storeId: store.id,
			taxBasedOn: typeof tax_based_on === 'string' ? tax_based_on : undefined,
		});

		patchTemporaryOrderPayload(newOrder.uuid, data).catch((error) => {
			newOrderLogger.error(getErrorMessage(error), {
				code: ERROR_CODES.CHECKOUT_UNEXPECTED,
			});
		});
	}, [newOrder, defaultCustomer, currency, prices_include_tax, tax_based_on, country]);

	return { newOrder };
};
