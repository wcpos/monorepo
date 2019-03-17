import React, { useState } from 'react';
import { Q } from '@nozbe/watermelondb';
import useDatabase from '../../hooks/use-database';
import useObservable from '../../hooks/use-observable';
import useUI from '../../hooks/use-ui';
import Text from '../../components/text';
import Table from './table';
import Settings from './settings';
import Tooltip from '../../components/tooltip';
import Segment, { SegmentGroup } from '../../components/segment';
import Actions from './actions';
import Loader from '../../components/loader';
import Button from '../../components/button';
import { initProductsUI } from '../../actions/product';

const Products = () => {
	const [search, setSearch] = useState('');
	const database = useDatabase();

	const products = useObservable(
		// () =>
		database.collections
			.get('products')
			.query(Q.where('name', Q.like(`%${Q.sanitizeLikeString(search)}%`)))
			.observeWithColumns(['name', 'regular_price', 'sku'])
		// []
	);

	const ui: any = useUI();

	if (!ui) {
		return <Button title="Init UI" onPress={initProductsUI} />;
	}

	// const columns = useObservable(() => ui.columns.observe(), null);
	return (
		<SegmentGroup>
			<Segment>
				<Actions onSearch={setSearch} />
			</Segment>
			<Segment>
				<Tooltip popover={<Settings columns={ui.columns} />}>
					<Text>Settings</Text>
				</Tooltip>
			</Segment>
			<Segment>
				<Table
					// database={this.props.database}
					// deleteRecord={this.deleteRecord}
					// search={this.state.search}
					// sort={this.handleSort}
					// sortBy={this.state.sortBy}
					// sortDirection={this.state.sortDirection}
					columns={ui.columns}
					products={products}
				/>
			</Segment>

			<Segment content={products && products.length} />
		</SegmentGroup>
	);
};

export default Products;
