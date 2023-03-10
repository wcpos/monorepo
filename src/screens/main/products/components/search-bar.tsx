import * as React from 'react';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import { useDetectBarcode } from '@wcpos/hooks/src/use-hotkeys';

import { t } from '../../../../lib/translations';
import Search from '../../components/product/search';
import UISettings from '../../components/ui-settings';
import { ProductCategoriesProvider } from '../../contexts/categories';
import useProducts from '../../contexts/products';
import { ProductTagsProvider } from '../../contexts/tags';
import useUI from '../../contexts/ui-settings';

const SearchBar = () => {
	const { setQuery } = useProducts();
	const { uiSettings } = useUI('products');

	/**
	 *
	 */
	useDetectBarcode((barcode) => {
		setQuery('selector.barcode', barcode);
	});

	/**
	 *
	 */
	return (
		<>
			<ErrorBoundary>
				<ProductCategoriesProvider initialQuery={{}}>
					<ProductTagsProvider initialQuery={{}}>
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
