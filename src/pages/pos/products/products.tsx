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
	const [{ user, storePath }] = useAppState();
	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));
	const display = useObservableState(ui.get$('display'), ui.get('display'));

	// const [columns, setColumns] = React.useState([]);
	const [query, setQuery] = React.useState({
		search: '',
		sortBy: 'name',
		sortDirection: 'asc',
	});

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
				<Actions columns={columns} display={display} ui={ui} />
			</Segment>
			<Segment grow>
				<Table query={query} columns={columns} display={display} sort={onSort} />
			</Segment>
			<Segment>
				<Button
					title="Add Products"
					onPress={async () => {
						console.log(storePath);

						// const wpCredentials = user.sites[0].wp_credentials[0];
						// const { data } = await http('https://wcposdev.wpengine.com/wp-json/wc/v3/products', {
						// 	auth: {
						// 		username: wpCredentials.consumer_key,
						// 		password: wpCredentials.consumer_secret,
						// 	},
						// });
						// storeDB.collections.products.bulkInsert(data);
					}}
				/>
			</Segment>
		</Segment.Group>
	);
};

export default Products;
