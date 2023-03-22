import * as React from 'react';

import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';
import { useObservableState } from 'observable-hooks';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import { useDetectBarcode } from '@wcpos/hooks/src/use-hotkeys';

import { t } from '../../../../lib/translations';
import Search from '../../components/product/search';
import UISettings from '../../components/ui-settings';
import { ProductCategoriesProvider } from '../../contexts/categories';
import useProducts from '../../contexts/products';
import { ProductTagsProvider } from '../../contexts/tags';
import useUI from '../../contexts/ui-settings';
import useCurrentOrder from '../contexts/current-order';

const SearchBar = () => {
	const { query$, setQuery, data: products } = useProducts();
	const query = useObservableState(query$, query$.getValue());
	const { addProduct } = useCurrentOrder();
	const { uiSettings } = useUI('pos.products');

	/**
	 *
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
