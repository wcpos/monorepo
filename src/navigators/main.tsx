import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { switchMap, map, shareReplay, filter, tap } from 'rxjs/operators';
import { Q } from '@nozbe/watermelondb';
import PageLayout from '../layout/page';
import MasterBar from '../layout/masterbar';
import POS from '../pages/pos';
import Products from '../pages/products';
// import Orders from '../sections/orders';
// import Customers from '../sections/customers';
import Support from '../pages/support';
import useAppState from '../hooks/use-app-state';
import Text from '../components/text';

const init = async (database) => {
	await database.action(async () => {
		const newUI = await database.collections.get('uis').create((ui) => {
			ui.section = 'pos_products';
			ui.set({
				sortBy: 'name',
				sortDirection: 'asc',
				width: '60%',
				columns: [
					{ key: 'image', disableSort: true, order: 0 },
					{ key: 'name', order: 1 },
					{ key: 'sku', hide: true, order: 2 },
					{ key: 'price', order: 3 },
					{ key: 'actions', disableSort: true, order: 4 },
				],
				display: [
					{ key: 'sku', hide: true, order: 0 },
					{ key: 'categories', order: 1 },
					{ key: 'tags', hide: true, order: 2 },
				],
			});
		});
		return newUI;
	});
};

const Screen = ({ route, navigation }) => {
	const [{ storeDB }] = useAppState();
	const uiResource = new ObservableResource(
		storeDB.collections
			.get('uis')
			.query(Q.where('section', 'pos_products'))
			.observeWithColumns(['width', 'sortBy', 'sortDirection'])
			.pipe(
				filter((uis) => {
					if (uis.length > 0) {
						return true;
					}
					init(storeDB);
					return false;
				}),
				map((array) => array[0]),
				tap((result) => console.log('UI found', result))

				// shareReplay()
			)
	);

	const components = {
		POS: <POS uiResource={uiResource} />,
		Products: <Products />,
		Support: <Support />,
	};

	return (
		<React.Suspense fallback={<Text>Loading drawer page...</Text>}>
			<PageLayout header={<MasterBar />}>{components[route.name]}</PageLayout>
		</React.Suspense>
	);
};

const Drawer = createDrawerNavigator();

const MainNavigator: React.FC = () => {
	return (
		<Drawer.Navigator>
			<Drawer.Screen name="POS" component={Screen} />
			<Drawer.Screen name="Products" component={Screen} />
			<Drawer.Screen name="Support" component={Screen} />
		</Drawer.Navigator>
	);
};

export default MainNavigator;
