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

	const ui: any = useUI('products');

	// const columns = useObservable(() => ui.columns.observe(), null);
	return (
		ui && (
			<SegmentGroup style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
				<Segment style={{ flex: -1 }}>
					<Actions onSearch={setSearch} />
				</Segment>
				<Segment style={{ flex: -1 }}>
					<Tooltip popover={<Settings columns={ui.columns} />}>
						<Text>Settings</Text>
					</Tooltip>
				</Segment>
				<Segment style={{ flex: 1, padding: 0 }}>
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

				<Segment style={{ flex: -1 }} content={products && products.length} />
			</SegmentGroup>
		)
	);
};

export default Products;
