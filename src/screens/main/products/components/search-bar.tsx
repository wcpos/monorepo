import * as React from 'react';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';

import { t } from '../../../../lib/translations';
import FilterBar from '../../components/product/filter-bar';
import Search from '../../components/product/search';
import UISettings from '../../components/ui-settings';
import useUI from '../../contexts/ui-settings';

const SearchBar = () => {
	const { uiSettings } = useUI('products');

	/**
	 *
	 */
	// useBarcodeDetection((barcode) => {
	// 	setQuery('selector.barcode', barcode);
	// });

	/**
	 *
	 */
	return (
		<Box fill space="small">
			<Box horizontal align="center" padding="small" paddingBottom="none" space="small">
				<ErrorBoundary>
					<Search />
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
