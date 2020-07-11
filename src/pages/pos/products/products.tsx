import React from 'react';
import { useObservableSuspense, useObservableState } from 'observable-hooks';
import { switchMap } from 'rxjs/operators';
import { useTranslation } from 'react-i18next';
import Segment from '../../../components/segment';
import Input from '../../../components/textinput';
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
	const [query, setQuery] = React.useState({
		search: '',
		sortBy: 'name',
		sortDirection: 'asc',
	});

	// const products = useObservableSuspense(store.getDataResource('products'));
	const storeDatabase = useObservableSuspense(store.dbResource);

	// React.useEffect(() => {
	// 	debugger;
	// 	(async function init() {
	// 		debugger;
	// 		await store.db.then((db) => {
	// 			debugger;
	// 		});
	// 	})();
	// }, []);

	React.useEffect(() => {
		ui.columns$.subscribe((x) => setColumns(x));
		return ui.columns$.unsubscribe;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const onSort = ({ sortBy, sortDirection }) => {
		console.log({ sortBy, sortDirection });
		setQuery({ ...query, sortBy, sortDirection });
	};

	const onSearch = (search) => {
		setQuery({ ...query, search });
	};

	return (
		<Segment.Group>
			<Segment>
				<Input value={query.search} placeholder="Search products" onChangeText={onSearch} />
				<Actions ui={ui} />
			</Segment>
			<Segment grow>
				<Table query={query} columns={columns} display={ui.display} sort={onSort} />
			</Segment>
			<Segment>
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
	);
};

export default Products;
