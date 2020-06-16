import React from 'react';
import { useObservableSuspense } from 'observable-hooks';
import { useTranslation } from 'react-i18next';
import Segment from '../../../components/segment';
import Table from './table';
import Actions from './actions';
import Text from '../../../components/text';

interface Props {
	productsResource: any;
	ui: any;
}

/**
 *
 */
const Products: React.FC<Props> = ({ productsResource, ui }) => {
	// const { t } = useTranslation();

	const display = useObservableSuspense(ui.displayResource);
	const columns = useObservableSuspense(ui.columnsResource);
	const products = useObservableSuspense(productsResource);

	/**
	 * Decorate table cells
	 */
	// columns.map((column: any) => {
	// 	column.label = t(`pos_products.column.label.${column.key}`);
	// 	switch (column.key) {
	// 		case 'thumbnail':
	// 			column.cellRenderer = ({ cellData }: any) => (
	// 				<Image src={cellData} style={{ width: 100, height: 100 }} />
	// 			);
	// 			break;
	// 		case 'name':
	// 			column.cellRenderer = ({ rowData }: any) => (
	// 				<Name
	// 					product={rowData}
	// 					showSKU={!display.filter((d) => d.key === 'sku')[0].hide}
	// 					showCategories={!display.filter((d) => d.key === 'categories')[0].hide}
	// 					showTags={!display.filter((d) => d.key === 'tags')[0].hide}
	// 				/>
	// 			);
	// 			break;
	// 		// case 'sku':
	// 		// 	column.cellRenderer = ({ cellData }: any) => <Text>{cellData}</Text>;
	// 		// 	break;
	// 		// case 'price':
	// 		// 	column.cellRenderer = ({ rowData }: any) => <RegularPrice product={rowData} />;
	// 		// 	break;
	// 		case 'actions':
	// 			column.cellRenderer = ({ rowData }: any) => (
	// 				<ProductActions
	// 					product={rowData}
	// 					addToCart={() => {
	// 						console.log('add to cart');
	// 					}}
	// 				/>
	// 			);
	// 			break;
	// 		default:
	// 			break;
	// 	}
	// 	return column;
	// });

	// /**
	//  * Decorate table cells
	//  */
	// display.map((d: any) => {
	// 	d.label = t(`pos_products.display.label.${d.key}`);
	// 	return d;
	// });

	// const data = [new Product(storeDB.collections.get('products'), simpleProduct)];

	const onSort = ({ sortBy, sortDirection }) => {
		ui.updateWithJson({ sortBy, sortDirection });
	};

	const onResetUI = () => {
		ui.reset();
	};

	return (
		<React.Suspense fallback={<Text>loading products...</Text>}>
			<Segment.Group>
				<Segment>
					<Actions columns={columns} display={display} resetUI={onResetUI} />
				</Segment>
				<Segment grow>
					<Table products={products} columns={columns} display={display} sort={onSort} />
				</Segment>
				<Segment>
					<Text>Footer</Text>
				</Segment>
			</Segment.Group>
		</React.Suspense>
	);
};

export default Products;
