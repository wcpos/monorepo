import React from 'react';
import { useObservableSuspense } from 'observable-hooks';
import { useTranslation } from 'react-i18next';
import TableLayout from '../../../layout/table';
import Table from '../../../components/table';
import TableActions from './actions';
import ProductActions from './cells/actions';
import Name from './cells/name';
import Image from './cells/image';
import Text from '../../../components/text';

interface Props {
	productsResource: any;
	ui: any;
}

/**
 *
 */
const Products: React.FC<Props> = ({ productsResource, ui }) => {
	const { t } = useTranslation();

	const display = useObservableSuspense(ui.displayResource);
	const columns = useObservableSuspense(ui.columnsResource);
	const products = useObservableSuspense(productsResource);

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
