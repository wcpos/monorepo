import React from 'react';
import { useObservableSuspense, useObservableState } from 'observable-hooks';
import { useTranslation } from 'react-i18next';
import Segment from '../../../components/segment';
import Table from './table';
import Actions from './actions';
import Text from '../../../components/text';
import useAppState from '../../../hooks/use-app-state';
import Button from '../../../components/button';
import http from '../../../lib/http';

interface Props {
	productsResource: any;
	ui: any;
}

/**
 *
 */
const Products: React.FC<Props> = ({ ui }) => {
	// const { t } = useTranslation();
	const [{ appUser, store }] = useAppState();
	const [columns, setColumns] = React.useState([]);

	const products = useObservableSuspense(store.getDataResource('products'));
	const storeDatabase = useObservableSuspense(store.dbResource);

	React.useEffect(() => {
		ui.columns$.subscribe((x) => setColumns(x));
		return ui.columns$.unsubscribe;
	}, []);

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

	return (
		<React.Suspense fallback={<Text>loading products...</Text>}>
			<Segment.Group>
				<Segment>
					<Actions ui={ui} />
				</Segment>
				<Segment grow>
					<Table products={products} columns={columns} display={ui.display} sort={onSort} />
				</Segment>
				<Segment>
					<Text>Footer</Text>
					<Button
						title="Add Products"
						onPress={async () => {
							const wpUser = await appUser.collections().wp_users.findOne().exec();
							const { data } = await http('https://wcposdev.wpengine.com/wp-json/wc/v3/products', {
								auth: {
									username: wpUser.consumer_key,
									password: wpUser.consumer_secret,
								},
							});
							storeDatabase.collections.products.bulkInsert(data);
						}}
					/>
				</Segment>
			</Segment.Group>
		</React.Suspense>
	);
};

export default Products;
