import React from 'react';
import TableLayout from '../../../layout/table';
import Table from '../../../components/table';
import TableActions from './actions';
import simpleProduct from '../../../../jest/__fixtures__/product.json';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { map, tap } from 'rxjs/operators';
import ProductActions from './cells/actions';
import Name from './cells/name';
import Image from './cells/image';

interface Props {
	ui: any;
}

/**
 *
 */
const Products: React.FC<Props> = ({ ui }) => {
	// const columnsResource = new ObservableResource(ui.columns.observe().pipe(shareReplay(1)));
	const displayResource = new ObservableResource(
		ui.display
			.observeWithColumns(['hide', 'sortBy', 'sortDirection'])
			.pipe(map((results) => results.sort((a, b) => a.order - b.order)))
	);
	const display = useObservableSuspense(displayResource);
	const columnsResource = new ObservableResource(
		ui.columns
			.observeWithColumns(['hide'])
			.pipe(map((results) => results.sort((a, b) => a.order - b.order)))
	);
	const columns = useObservableSuspense(columnsResource);

	/**
	 * Decorate table cells
	 */
	columns.map((column: any) => {
		switch (column.key) {
			case 'thumbnail':
				column.cellRenderer = ({ cellData }: any) => (
					<Image src={cellData} style={{ width: 100, height: 100 }} />
				);
				break;
			case 'name':
				column.cellRenderer = ({ rowData }: any) => <Name product={rowData} display={ui.display} />;
				break;
			// case 'sku':
			// 	column.cellRenderer = ({ cellData }: any) => <Text>{cellData}</Text>;
			// 	break;
			// case 'price':
			// 	column.cellRenderer = ({ rowData }: any) => <RegularPrice product={rowData} />;
			// 	break;
			case 'actions':
				column.cellRenderer = ({ rowData }: any) => (
					<ProductActions
						product={rowData}
						addToCart={() => {
							console.log('add to cart');
						}}
					/>
				);
				break;
		}
		return column;
	});

	const data = [simpleProduct];

	const onSort = ({ sortBy, sortDirection }) => {
		ui.updateWithJson({ sortBy, sortDirection });
	};

	return (
		<TableLayout
			actions={<TableActions columns={columns} display={display} onRestoreUi={ui.reset} />}
			table={
				<Table
					columns={columns}
					data={data}
					sort={onSort}
					sortBy={ui.sortBy}
					sortDirection={ui.sortDirection}
				/>
			}
			footer="Footer"
		/>
	);
};

export default Products;
