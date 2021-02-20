import * as React from 'react';
import { useObservableSuspense, useObservableState } from 'observable-hooks';
import { switchMap } from 'rxjs/operators';
import { useTranslation } from 'react-i18next';
import get from 'lodash/get';
import Segment from '../../../components/segment';
import Input from '../../../components/textinput';
import Popover from '../../../components/popover';
import Table from './table';
import Actions from './actions';
import Text from '../../../components/text';
import useAppState from '../../../hooks/use-app-state';
import Button from '../../../components/button';
import http from '../../../lib/http';

type Sort = import('../../../components/table/types').Sort;

interface IPOSProductsProps {
	ui: any;
}

/**
 *
 */
const Products = ({ ui }: IPOSProductsProps) => {
	// const { t } = useTranslation();
	const [{ user, storePath, storeDB }] = useAppState();
	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));
	const [display] = useObservableState(() => ui.get$('display'), ui.get('display'));

	// const [columns, setColumns] = React.useState([]);
	const [query, setQuery] = React.useState({
		search: '',
		sortBy: 'name',
		sortDirection: 'asc',
	});

	const onSort: Sort = ({ sortBy, sortDirection }) => {
		console.log({ sortBy, sortDirection });
		// @ts-ignore
		setQuery({ ...query, sortBy, sortDirection });
	};

	const onSearch = (search: string) => {
		setQuery({ ...query, search });
	};

	return (
		<Segment.Group>
			<Segment>
				<Input value={query.search} placeholder="Search products" onChangeText={onSearch} />
				<Popover content={<Actions columns={columns} display={display} ui={ui} />}>
					<Button title="Table Settings" />
				</Popover>
			</Segment>
			<Segment grow>
				<Table query={query} columns={columns} display={display} sort={onSort} />
			</Segment>
			<Segment>
				<Button
					title="Add Products"
					onPress={async () => {
						const path = storePath.split('.');
						const site = user.get(path.slice(1, 3).join('.'));
						const wpCredentials = user.get(path.slice(1, 5).join('.'));

						const { data } = await http(`${site.wc_api_url}products`, {
							auth: {
								username: wpCredentials.consumer_key,
								password: wpCredentials.consumer_secret,
							},
						});
						storeDB.collections.products.bulkInsert(data);
					}}
				/>
			</Segment>
		</Segment.Group>
	);
};

export default Products;
