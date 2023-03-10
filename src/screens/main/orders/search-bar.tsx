import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Pill from '@wcpos/components/src/pill';
import Search from '@wcpos/components/src/search';
import TextInput from '@wcpos/components/src/textinput';

import { t } from '../../../lib/translations';
import useOrders from '../contexts/orders';

const SearchBar = () => {
	const { query$, setQuery } = useOrders();
	const query = useObservableState(query$, query$.getValue());
	const theme = useTheme();

	/**
	 *
	 */
	const onSearch = React.useCallback(
		(search: string) => {
			setQuery('search', search);
		},
		[setQuery]
	);

	/**
	 *
	 */
	const filters = React.useMemo(() => {
		const array = [];
		const status = get(query, ['selector', 'status']);
		if (status) {
			array.push(
				<Pill
					key="status"
					removable
					onRemove={() => setQuery('selector.status', null)}
					icon="circle"
				>
					{status}
				</Pill>
			);
		}

		const customerID = get(query, ['selector', 'customer_id']);
		if (customerID || customerID === 0) {
			array.push(
				<Pill
					key="customer"
					removable
					onRemove={() => setQuery('selector.customer_id', null)}
					icon="user"
				>
					{t('Customer ID: {id}', { _tags: 'core', id: customerID })}
				</Pill>
			);
		}

		return array.length !== 0 ? (
			<Pill.Group style={{ paddingLeft: theme.spacing.small }}>{array}</Pill.Group>
		) : undefined;
	}, [query, setQuery, theme.spacing.small]);

	/**

	/**
	 *
	 */
	return (
		<TextInput
			placeholder={t('Search Orders', { _tags: 'core' })}
			value={query.search}
			onChangeText={onSearch}
			leftAccessory={filters}
			containerStyle={{ flex: 1 }}
			clearable
		/>
	);
};

export default SearchBar;
