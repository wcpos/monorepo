import * as React from 'react';

import ErrorBoundary from '@wcpos/components/src/error-boundary';

import { t } from '../../../../lib/translations';
import Search from '../../components/product/search';
import UISettings from '../../components/ui-settings';
import { ProductCategoriesProvider } from '../../contexts/categories';
import { ProductTagsProvider } from '../../contexts/tags';
import useUI from '../../contexts/ui-settings';
import useCartHelpers from '../../hooks/use-cart-helpers';

/**
 *
 */
const SearchBar = () => {
	const { uiSettings } = useUI('pos.products');
	const { addProduct, addVariation } = useCartHelpers();

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
						<Search addProduct={addProduct} addVariation={addVariation} />
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
