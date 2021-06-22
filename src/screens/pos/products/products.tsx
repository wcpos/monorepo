import * as React from 'react';
import { useObservableSuspense, useObservableState } from 'observable-hooks';
import { switchMap } from 'rxjs/operators';
import { useTranslation } from 'react-i18next';
import get from 'lodash/get';
import Segment from '@wcpos/common/src/components/segment';
import ErrorBoundary from '@wcpos/common/src/components/error-boundary';
import TextInput from '@wcpos/common/src/components/textinput';
import Search from '@wcpos/common/src/components/search';
import Tag from '@wcpos/common/src/components/tag';
import Actions from './actions';
import Table from './table';
import Footer from './footer';
import UiSettings from '../../common/ui-settings';

type Sort = import('@wcpos/common/src/components/table/types').Sort;

interface IPOSProductsProps {
	ui: any;
}

interface ProductQueryContextProps {
	query: any;
	setQuery: any;
}

export const ProductQueryContext = React.createContext<ProductQueryContextProps>({
	query: undefined,
	setQuery: undefined,
});

/**
 *
 */
const Products = ({ ui }: IPOSProductsProps) => {
	// const { t } = useTranslation();
	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));
	const [display] = useObservableState(() => ui.get$('display'), ui.get('display'));

	// const [columns, setColumns] = React.useState([]);
	const [query, setQuery] = React.useState({
		search: '',
		sortBy: 'name',
		sortDirection: 'asc',
		filter: {
			categories: [],
			tags: [],
		},
	});

	const onSort: Sort = ({ sortBy, sortDirection }) => {
		console.log({ sortBy, sortDirection });
		// @ts-ignore
		setQuery({ ...query, sortBy, sortDirection });
	};

	const onSearch = (search: string) => {
		setQuery({ ...query, search });
	};

	const handleRemoveFilter = () => {
		query.filter.categories = [];
		setQuery({ ...query });
	};

	const renderActiveFilters = () => {
		return query.filter.categories.map((category: { id: number; name: string }) => (
			<Tag key={category.id} removable onRemove={handleRemoveFilter}>
				{category.name}
			</Tag>
		));
	};

	return (
		<ProductQueryContext.Provider value={{ query, setQuery }}>
			<Segment.Group>
				<Segment style={{ flexDirection: 'row' }}>
					<Search
						label="Search products"
						placeholder="Search products"
						value={query.search}
						filters={query.filter.categories}
						onSearch={onSearch}
						actions={[<UiSettings ui={ui} />]}
					/>
				</Segment>
				<Segment grow>
					<Table query={query} columns={columns} display={display} sort={onSort} />
				</Segment>
				<Segment>
					<Footer />
				</Segment>
			</Segment.Group>
		</ProductQueryContext.Provider>
	);
};

export default Products;
