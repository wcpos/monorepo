import * as React from 'react';

import { useNavigation } from '@react-navigation/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Icon from '@wcpos/components/src/icon';

import { t } from '../../../lib/translations';
import FilterBar from '../components/product/filter-bar';
import Search from '../components/product/search';
import UISettings from '../components/ui-settings';
import useUI from '../contexts/ui-settings';

const SearchBar = ({ query }) => {
	const { uiSettings } = useUI('products');
	// const navigation = useNavigation();

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
					<Search query={query} />
				</ErrorBoundary>
				<ErrorBoundary>
					{/* <Icon
						name="plus"
						onPress={() => navigation.navigate('AddProduct')}
						tooltip={t('Add new customer', { _tags: 'core' })}
					/> */}
					<UISettings uiSettings={uiSettings} title={t('Product Settings', { _tags: 'core' })} />
				</ErrorBoundary>
			</Box>
			<Box horizontal padding="small" paddingTop="none">
				<ErrorBoundary>
					<FilterBar query={query} />
				</ErrorBoundary>
			</Box>
		</Box>
	);
};

export default SearchBar;
