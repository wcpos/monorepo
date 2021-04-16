import * as React from 'react';
import { useObservableSuspense, useObservableState } from 'observable-hooks';
import { switchMap } from 'rxjs/operators';
import { useTranslation } from 'react-i18next';
import get from 'lodash/get';
import Segment from '@wcpos/common/src/components/segment';
import Input from '@wcpos/common/src/components/textinput';
import Popover from '@wcpos/common/src/components/popover';
import Text from '@wcpos/common/src/components/text';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import Button from '@wcpos/common/src/components/button';
import Actions from './actions';
import Table from './table';

type Sort = import('@wcpos/common/src/components/table/types').Sort;
type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;
type UserDocument = import('@wcpos/common/src/database').UserDocument;

interface IPOSProductsProps {
	ui: any;
}

/**
 *
 */
const Products = ({ ui }: IPOSProductsProps) => {
	// const { t } = useTranslation();
	const { user, storeDB } = useAppState() as { user: UserDocument; storeDB: StoreDatabase };
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
		// @ts-ignore
		<Segment.Group>
			<Segment>
				<Input value={query.search} placeholder="Search products" onChange={onSearch} />
				<Actions columns={columns} display={display} ui={ui} />
			</Segment>
			<Segment grow>
				<Table query={query} columns={columns} display={display} sort={onSort} />
			</Segment>
			<Segment>
				<Button
					title="Add Products"
					onPress={async () => {
						// @ts-ignore
						const replicationState = storeDB.products.syncRestApi({
							url: 'products',
							pull: {},
						});
						replicationState.run(false);
					}}
				/>
			</Segment>
		</Segment.Group>
	);
};

export default Products;
