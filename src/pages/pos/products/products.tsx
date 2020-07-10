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
	const [{ store }] = useAppState();
	const [columns, setColumns] = React.useState([]);
	const [search, setSearch] = React.useState('');

	// const products = useObservableSuspense(store.getDataResource('products'));

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
	}, []);

	const onSort = ({ sortBy, sortDirection }) => {
		ui.updateWithJson({ sortBy, sortDirection });
	};

	const onSearch = (value) => {
		setSearch(value);
	};

	return (
		<Segment.Group>
			<Segment>
				<Input value={search} placeholder="Search products" onChangeText={onSearch} />
				<Actions ui={ui} />
			</Segment>
			<Segment grow>
				<Table search={search} columns={columns} display={ui.display} sort={onSort} />
			</Segment>
			<Segment>
				<Text>Footer</Text>
			</Segment>
		</Segment.Group>
	);
};

export default Products;
