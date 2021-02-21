import * as React from 'react';
import { View, Text } from 'react-native';
import { useObservable, useObservableState } from 'observable-hooks';
import { switchMap, tap, debounceTime, catchError, distinctUntilChanged } from 'rxjs/operators';
import Segment from '../../components/segment';
import Input from '../../components/textinput';
import Button from '../../components/button';
import Table from './table';
import Actions from './actions';
import useAppState from '../../hooks/use-app-state';
import WcApiService from '../../services/wc-api';
import * as Styled from './styles';

type Sort = import('../../components/table/types').Sort;

const Products = () => {
	const [{ user, storePath, storeDB }] = useAppState();
	const ui = storeDB.getUI('products');

	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));

	const [query, setQuery] = React.useState({
		search: '',
		sortBy: 'name',
		sortDirection: 'asc',
	});

	const products$ = useObservable(
		// A stream of React elements!
		(inputs$) =>
			inputs$.pipe(
				distinctUntilChanged((a, b) => a[0] === b[0]),
				debounceTime(150),
				switchMap(([q]) => {
					const regexp = new RegExp(escape(q.search), 'i');
					const RxQuery = storeDB.collections.products
						.find({
							selector: {
								name: { $regex: regexp },
							},
						})
						.sort({ [q.sortBy]: q.sortDirection });
					return RxQuery.$;
				}),
				catchError((err) => {
					console.error(err);
					return err;
				})
			),
		[query] as const
	);

	const products = useObservableState(products$, []);

	const onSearch = (value: string) => {
		console.log(value);
	};

	const onSort: Sort = ({ sortBy, sortDirection }) => {
		console.log({ sortBy, sortDirection });
		// ui.updateWithJson({ sortBy, sortDirection });
	};

	return (
		<Styled.Container>
			<Segment.Group>
				<Segment>
					<Input placeholder="Search products" onChangeText={onSearch} />
					<Actions columns={columns} query={query} ui={ui} />
				</Segment>
				<Segment grow>
					<Table columns={columns} products={products} />
				</Segment>
				<Segment>
					<Text>
						<Button
							title="Fetch Tax Rates"
							onPress={async () => {
								const path = storePath.split('.');
								const site = user.get(path.slice(1, 3).join('.'));
								const wpCredentials = user.get(path.slice(1, 5).join('.'));
								const baseUrl = site.wc_api_url;
								const collection = 'taxes';
								const key = wpCredentials.consumer_key;
								const secret = wpCredentials.consumer_secret;
								const api = new WcApiService({ baseUrl, collection, key, secret });
								const data = await api.fetch();
								console.log(data);
								await storeDB.upsertLocal(
									'tax_rates',
									// turn array into json
									data.reduce((obj: Record<string, unknown>, rate: any) => {
										obj[rate.id] = rate;
										return obj;
									}, {})
								);
							}}
						/>
						<Button
							title="Fetch Tax Classes"
							onPress={async () => {
								const path = storePath.split('.');
								const site = user.get(path.slice(1, 3).join('.'));
								const wpCredentials = user.get(path.slice(1, 5).join('.'));
								const baseUrl = site.wc_api_url;
								const collection = 'taxes/classes';
								const key = wpCredentials.consumer_key;
								const secret = wpCredentials.consumer_secret;
								const api = new WcApiService({ baseUrl, collection, key, secret });
								const data = await api.fetch();
								console.log(data);
								await storeDB.upsertLocal(
									'tax_classes',
									// turn array into json
									data.reduce((obj: Record<string, unknown>, taxClass: any) => {
										obj[taxClass.slug] = taxClass;
										return obj;
									}, {})
								);
							}}
						/>
					</Text>
				</Segment>
			</Segment.Group>
		</Styled.Container>
	);
};

export default Products;
