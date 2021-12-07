import * as React from 'react';
import { View } from 'react-native';
import { useObservableState } from 'observable-hooks';
import useIdAudit from '@wcpos/common/src/hooks/use-id-audit';
import useRestQuery from '@wcpos/common/src/hooks/use-rest-query';
import Segment from '@wcpos/common/src/components/segment';
import UiSettings from '../../common/ui-settings';
import Table from './table';
import SearchBar from './search-bar';

interface POSProductsProps {
	ui: import('@wcpos/common/src/hooks/use-ui-resource').UIDocument;
}

/**
 *
 */
const POSProducts = ({ ui }: POSProductsProps) => {
	useIdAudit('products');
	useRestQuery('products');

	return (
		<Segment.Group style={{ width: '100%', height: '100%' }}>
			<Segment>
				<View style={{ flexDirection: 'row', alignItems: 'center' }}>
					<SearchBar />
					<UiSettings ui={ui} />
				</View>
			</Segment>
			<Segment grow style={{ padding: 0 }}>
				<Table ui={ui} />
			</Segment>
		</Segment.Group>
	);
};

export default POSProducts;
