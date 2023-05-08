import * as React from 'react';
import { View } from 'react-native';

import delay from 'lodash/delay';

import Popover from '@wcpos/components/src/popover';
import ScrollView from '@wcpos/components/src/scrollview';
import TextInput from '@wcpos/components/src/textinput';
import log from '@wcpos/utils/src/logger';

import CustomerSelectMenu from './menu';
import { t } from '../../../../lib/translations';
import useCustomers, { CustomersProvider } from '../../contexts/customers';
import usePullDocument from '../../contexts/use-pull-document';
import useCustomerNameFormat from '../../hooks/use-customer-name-format';

/**
 *
 * @returns
 */
const CustomerSelectSearch = ({ onSelectCustomer, autoFocus = false, value }) => {
	const [opened, setOpened] = React.useState(false);
	const { setQuery, resource, collection } = useCustomers();
	const [search, setSearch] = React.useState();
	const { format } = useCustomerNameFormat();
	const [selectedCustomer, setSelectedCustomer] = React.useState({ id: 0 });
	const pullDocument = usePullDocument();

	const onSearch = React.useCallback(
		(search) => {
			setSearch(search);
			React.startTransition(() => setQuery('search', search, true));
		},
		[setQuery]
	);

	/**
	 *
	 */
	const placeholder = React.useMemo(() => {
		if (selectedCustomer) {
			return format(selectedCustomer);
		}

		return t('Search Customers', { _tags: 'core' });
	}, [selectedCustomer, format]);

	/**
	 * HACK: get the selected customer from value and set it as selectedCustomer
	 */
	React.useEffect(() => {
		async function getCustomer() {
			try {
				let selectedCustomer = await collection.findOneFix({ selector: { id: value } }).exec();
				if (!selectedCustomer) {
					selectedCustomer = await pullDocument(value, collection);
				}
				setSelectedCustomer(selectedCustomer);
			} catch (error) {
				log.error(error);
			}
		}

		if (value) {
			getCustomer();
		}
	}, [collection, pullDocument, value]);

	/**
	 *
	 */
	return (
		<Popover
			opened={opened}
			//onOpen={() => setOpened(true)}
			onClose={() => setOpened(false)}
			withArrow={false}
			matchWidth
			withinPortal={false}
		>
			<Popover.Target>
				<TextInput
					placeholder={placeholder}
					value={search}
					onChangeText={onSearch}
					containerStyle={{ flex: 1 }}
					clearable
					autoFocus={autoFocus}
					/**
					 * FIXME: this is a hack, useEffect is being called before onLayout for the Popover.Target
					 * which means the width is not set correctly.
					 */
					onFocus={() => delay(() => setOpened(true), 100)}
				/>
			</Popover.Target>
			<Popover.Content style={{ paddingLeft: 0, paddingRight: 0, height: 300 }}>
				<CustomerSelectMenu onChange={onSelectCustomer} customersResource={resource} />
			</Popover.Content>
		</Popover>
	);
};

const CustomerSelectSearchWithProvider = (props) => {
	/**
	 *
	 */
	const initialQuery = React.useMemo(
		() => ({
			// search: '',
			sortBy: 'last_name',
			sortDirection: 'asc',
			// limit: 10,
		}),
		[]
	);

	return (
		<CustomersProvider initialQuery={initialQuery}>
			<React.Suspense>
				<CustomerSelectSearch {...props} />
			</React.Suspense>
		</CustomersProvider>
	);
};

export default CustomerSelectSearchWithProvider;
