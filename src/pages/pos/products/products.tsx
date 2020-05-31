import React from 'react';
import TableLayout from '../../../layout/table';
import Table from '../../../components/table';
import Actions from './actions';
import simpleProduct from '../../../../jest/__fixtures__/product.json';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { map, tap } from 'rxjs/operators';

interface Props {
	ui: any;
}

/**
 *
 */
const Products: React.FC<Props> = ({ ui }) => {
	// const columnsResource = new ObservableResource(ui.columns.observe().pipe(shareReplay(1)));
	const displayResource = new ObservableResource(
		ui.display.observe().pipe(map((results) => results.sort((a, b) => a.order - b.order)))
	);
	const display = useObservableSuspense(displayResource);
	const columnsResource = new ObservableResource(
		ui.columns.observeWithColumns(['name', 'sku']).pipe(
			map((results) => results.sort((a, b) => a.order - b.order)),
			tap((results) => {
				console.log(results);
			})
		)
	);
	const columns = useObservableSuspense(columnsResource);

	const data = [simpleProduct];

	return (
		<TableLayout
			actions={<Actions columns={columns} display={display} />}
			table={<Table columns={columns} data={data} />}
			footer="Footer"
		/>
	);
};

export default Products;
