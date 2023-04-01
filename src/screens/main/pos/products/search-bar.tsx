import * as React from 'react';

import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';
import { useObservableState } from 'observable-hooks';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import { useDetectBarcode } from '@wcpos/hooks/src/use-hotkeys';
import log from '@wcpos/utils/src/logger';

import { t } from '../../../../lib/translations';
import Search from '../../components/product/search';
import UISettings from '../../components/ui-settings';
import { ProductCategoriesProvider } from '../../contexts/categories';
import useProducts from '../../contexts/products';
import { ProductTagsProvider } from '../../contexts/tags';
import useUI from '../../contexts/ui-settings';
import useCurrentOrder from '../contexts/current-order';

/**
 *
 */
const SearchBar = () => {
	const { query$, setQuery, data: products, sync } = useProducts();
	const query = useObservableState(query$, query$.getValue());
	const { addProduct, currentOrder } = useCurrentOrder();
	const { uiSettings } = useUI('pos.products');
	const currentOrderStatus = useObservableState(currentOrder.status$, currentOrder.status);

	/**
	 * FIXME: seems kind of abritrary to have this in the search bar
	 */
	useDetectBarcode((barcode) => {
		setQuery('selector.barcode', barcode);
	});
	React.useEffect(() => {
		const barcode = get(query, ['selector', 'barcode']);
		if (barcode && isEmpty(query.search) && products.length === 1) {
			addProduct(products[0]);
			setQuery('selector.barcode', null);
		}
	}, [query, products, addProduct, setQuery]);

	/**
	 * FIXME: this is definitely not the right place for this but it's *a* place where we have
	 * access to the products->sync and the current order
	 */
	React.useEffect(() => {
		if (currentOrderStatus !== 'pos-open') {
			log.debug('syncing products after checkout');
			sync();
		}
	}, [currentOrderStatus, sync]);

	/**
	 *
	 */
	const initialCategoriesQuery = React.useMemo(() => ({}), []);
	const initialTagsQuery = React.useMemo(() => ({}), []);

	/**
	 *
	 */
	return (
		<>
			<ErrorBoundary>
				<ProductCategoriesProvider initialQuery={initialCategoriesQuery}>
					<ProductTagsProvider initialQuery={initialTagsQuery}>
						<Search />
					</ProductTagsProvider>
				</ProductCategoriesProvider>
			</ErrorBoundary>
			<ErrorBoundary>
				<UISettings uiSettings={uiSettings} title={t('Product Settings', { _tags: 'core' })} />
			</ErrorBoundary>
		</>
	);
};

export default SearchBar;
