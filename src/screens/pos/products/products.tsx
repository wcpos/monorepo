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
	ui: import('@wcpos/common/src/hooks/use-ui').UIDocument;
}

/**
 *
 */
const POSProducts = ({ ui }: POSProductsProps) => {
	useIdAudit('products');
	useRestQuery('products');

	return (
		<Segment.Group>
			<Segment>
				<View style={{ flexDirection: 'row' }}>
					<SearchBar />
					<UiSettings ui={ui} />
				</View>
			</Segment>
			<Segment grow>
				<Table ui={ui} />
			</Segment>
		</Segment.Group>
	);
};

export default POSProducts;
