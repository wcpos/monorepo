import * as React from 'react';

import get from 'lodash/get';
import { useLayoutObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Pill from '@wcpos/components/src/pill';
import TextInput from '@wcpos/components/src/textinput';

import { t } from '../../../lib/translations';
import { useOrders } from '../contexts/orders';

/**
 *
 */
const SearchBar = ({ query }) => {
	const theme = useTheme();
	const [search, setSearch] = React.useState('');
	const status = get(query, ['selector', 'status']);
	const customerID = get(query, ['selector', 'customer_id']);
	// const hasFilters = status || customerID || customerID === 0;

	/**
	 *
	 */
	const onSearch = React.useCallback(
		(search) => {
			setSearch(search);
			query.debouncedSearch(search);
		},
		[query]
	);

	/**
	 *
	 */
	return (
		<TextInput
			placeholder={t('Search Orders', { _tags: 'core' })}
			value={search}
			onChangeText={onSearch}
			// leftAccessory={
			// 	hasFilters && (
			// 		<Pill.Group style={{ paddingLeft: theme.spacing.small }}>
			// 			{!!status && (
			// 				<Pill
			// 					key="status"
			// 					removable
			// 					onRemove={() => setQuery('selector.status', null)}
			// 					icon="circle"
			// 				>
			// 					{status}
			// 				</Pill>
			// 			)}
			// 			{!!(customerID || customerID === 0) && (
			// 				<Pill
			// 					key="customer"
			// 					removable
			// 					onRemove={() => setQuery('selector.customer_id', null)}
			// 					icon="user"
			// 				>
			// 					{t('Customer ID: {id}', { _tags: 'core', id: customerID })}
			// 				</Pill>
			// 			)}
			// 		</Pill.Group>
			// 	)
			// }
			containerStyle={{ flex: 1 }}
			clearable
		/>
	);
};

export default SearchBar;
