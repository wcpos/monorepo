import React from 'react';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { map, tap, filter } from 'rxjs/operators';
import { useTranslation } from 'react-i18next';
import { Q } from '@nozbe/watermelondb';
import TableLayout from '../../../layout/table';
import Table from '../../../components/table';
import TableActions from './actions';
import simpleProduct from '../../../../jest/__fixtures__/product.json';
import ProductActions from './cells/actions';
import Name from './cells/name';
import Image from './cells/image';
import Product from '../../../database/models/store/product';
import useDatabase from '../../../hooks/use-database';
import Text from '../../../components/text';
import { syncIds } from '../../../services/wc-api';

interface Props {
	ui: any;
}

const initProducts = () => {};

/**
 *
 */
const Products: React.FC<Props> = ({ ui }) => {
	const { t } = useTranslation();
	const { storeDB, wpUser, site } = useDatabase();

	const displayResource = new ObservableResource(
		ui.display
			.observeWithColumns(['hide'])
			.pipe(map((results) => results.sort((a, b) => a.order - b.order)))
	);
	const display = useObservableSuspense(displayResource);
	const columnsResource = new ObservableResource(
		ui.columns
			.observeWithColumns(['hide', 'sortBy', 'sortDirection'])
			.pipe(map((results) => results.sort((a, b) => a.order - b.order)))
	);
	const columns = useObservableSuspense(columnsResource);

	const productResource = new ObservableResource(
		storeDB.collections
			.get('products')
			.query(Q.where('name', Q.like(`%${Q.sanitizeLikeString('')}%`)))
			.observe()
			.pipe(
				filter((products) => {
					if (products.length > 0) {
						return true;
					}
					syncIds(storeDB.collections.get('products'), wpUser, site);
				})
			)
	);
	const products = useObservableSuspense(productResource);

	/**
	 * Decorate table cells
	 */
	columns.map((column: any) => {
		column.label = t(`pos_products.column.label.${column.key}`);
		switch (column.key) {
			case 'thumbnail':
				column.cellRenderer = ({ cellData }: any) => (
					<Image src={cellData} style={{ width: 100, height: 100 }} />
				);
				break;
			case 'name':
				column.cellRenderer = ({ rowData }: any) => (
					<Name
						product={rowData}
						showSKU={!display.filter((d) => d.key === 'sku')[0].hide}
						showCategories={!display.filter((d) => d.key === 'categories')[0].hide}
						showTags={!display.filter((d) => d.key === 'tags')[0].hide}
					/>
				);
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
			default:
				break;
		}
		return column;
	});

	/**
	 * Decorate table cells
	 */
	display.map((d: any) => {
		d.label = t(`pos_products.display.label.${d.key}`);
		return d;
	});

	// const data = [new Product(storeDB.collections.get('products'), simpleProduct)];

	const onSort = ({ sortBy, sortDirection }) => {
		ui.updateWithJson({ sortBy, sortDirection });
	};

	return (
		<TableLayout
			actions={<TableActions columns={columns} display={display} onRestoreUi={ui.reset} />}
			table={
				<React.Suspense fallback={<Text>Fetching products...</Text>}>
					<Table
						columns={columns}
						data={products}
						sort={onSort}
						sortBy={ui.sortBy}
						sortDirection={ui.sortDirection}
					>
						{/**
						 * TODO:
						 *
						 * rowData => fetch Product
						 * cellData => return <Name /> etc
						 */}
					</Table>
				</React.Suspense>
			}
			footer="Footer"
		/>
	);
};

export default Products;
