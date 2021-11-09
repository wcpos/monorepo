import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import useIdAudit from '@wcpos/common/src/hooks/use-id-audit';
import useRestQuery from '@wcpos/common/src/hooks/use-rest-query';
import Segment from '@wcpos/common/src/components/segment';
import Table from './table';
import SearchBar from './search-bar';

interface POSProductsProps {
	ui: any;
}

/**
 *
 */
const Products = ({ ui }: POSProductsProps) => {
	const columns$ = ui.get$('columns');
	const columns = useObservableState(columns$, ui.get('columns'));
	useIdAudit('products');
	useRestQuery('products');

	return (
		<Segment.Group>
			<Segment>
				<SearchBar ui={ui} />
				{/* <Search
					label="Search Products"
					placeholder="Search Products"
					value={query.search}
					onSearch={onSearch}
					actions={[<UiSettings ui={ui} />]}
					filters={filters}
				/> */}
			</Segment>
			<Segment grow>
				<Table columns={columns} />
			</Segment>
		</Segment.Group>
	);
};

export default Products;
