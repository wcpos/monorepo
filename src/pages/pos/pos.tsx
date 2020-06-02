import React from 'react';
import { View, Text } from 'react-native';
import Products from './products';
import Cart from './cart';
import ErrorBoundary from '../../components/error';
import Draggable from '../../components/draggable';
import Button from '../../components/button';
import useStore from '../../hooks/use-store';
// import useObservable from '../../hooks/use-observable';
import { Q } from '@nozbe/watermelondb';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { switchMap, map, shareReplay, filter } from 'rxjs/operators';
import { getStoreDatabase } from '../../database';

const database = getStoreDatabase({ site: 'test', user: 'test' });

interface Props {}

const init = async () => {
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

const uiResource = new ObservableResource(
	database.collections
		.get('uis')
		.query(Q.where('section', 'pos_products'))
		.observeWithColumns(['width'])
		.pipe(
			filter((uis) => {
				if (uis.length > 0) {
					return true;
				}
				init();
				return false;
			}),
			map((array) => array[0])
			// shareReplay()
		)
);

// const getResource = (store) =>
// 	new ObservableResource(
// 		store.collections
// 			.get('uis')
// 			.query(Q.where('section', 'pos_products'))
// 			.observe()
// 			.pipe(
// 				map((array) => array[6])
// 				// shareReplay()
// 			)
// 	);

const POS: React.FC<Props> = () => {
	// const { store } = useStore();
	// const uiResource = getResource(store);
	const ui = useObservableSuspense(uiResource);
	const [width, setWidth] = React.useState(ui.width);

	const handleColumnResizeUpdate = ({ dx }) => {
		console.log(width + dx);
		setWidth(width + dx);
	};

	const handleColumnResizeEnd = ({ dx }) => {
		console.log(width + dx);
		ui.updateWithJson({ width: width + dx });
	};

	return (
		<React.Fragment>
			<View style={{ width }}>
				<ErrorBoundary>
					<React.Suspense fallback="Loading products...">
						<Products ui={ui} />
					</React.Suspense>
				</ErrorBoundary>
			</View>
			<Draggable onUpdate={handleColumnResizeUpdate} onEnd={handleColumnResizeEnd}>
				<View style={{ backgroundColor: '#000', padding: 20 }}></View>
			</Draggable>
			<View style={{ flexGrow: 1 }}>
				<ErrorBoundary>
					<Cart />
				</ErrorBoundary>
			</View>
		</React.Fragment>
	);
};

export default POS;
