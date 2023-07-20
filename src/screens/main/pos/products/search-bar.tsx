import * as React from 'react';

import { useNavigationState } from '@react-navigation/native';
import get from 'lodash/get';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';

import { t } from '../../../../lib/translations';
import FilterBar from '../../components/product/filter-bar';
import Search from '../../components/product/search';
import UISettings from '../../components/ui-settings';
import { useProducts } from '../../contexts/products';
import useUI from '../../contexts/ui-settings';
import useCartHelpers from '../../hooks/use-cart-helpers';

/**
 *
 */
const SearchBar = () => {
	const { uiSettings } = useUI('pos.products');
	const { addProduct, addVariation } = useCartHelpers();
	const orderComplete = useNavigationState((state) => {
		return get(state, ['routes', 1, 'name']) === 'Receipt';
	});
	const { sync } = useProducts();

	/**
	 * HACK: I want to trigger a sync of products when the order is paid
	 * listen for route changes to cart/receipt and trigger sync
	 */
	React.useEffect(() => {
		if (orderComplete) {
			sync();
		}
	}, [orderComplete, sync]);

	/**
	 *
	 */
	return (
		<Box fill space="small">
			<Box horizontal align="center" padding="small" paddingBottom="none" space="small">
				<ErrorBoundary>
					<Search addProduct={addProduct} addVariation={addVariation} />
				</ErrorBoundary>
				<ErrorBoundary>
					<UISettings uiSettings={uiSettings} title={t('Product Settings', { _tags: 'core' })} />
				</ErrorBoundary>
			</Box>
			<Box horizontal padding="small" paddingTop="none">
				<ErrorBoundary>
					<FilterBar />
				</ErrorBoundary>
			</Box>
		</Box>
	);
};

export default SearchBar;
