import * as React from 'react';

import Popover from '@wcpos/components/src/popover';
import Suspense from '@wcpos/components/src/suspense';
import log from '@wcpos/utils/src/logger';

import CustomerSelectMenu from './menu';
import SearchInput from './search-input';
import { t } from '../../../../lib/translations';
import { CustomersProvider } from '../../contexts/customers';
import { Query } from '../../contexts/query';
import usePullDocument from '../../contexts/use-pull-document';
import useCollection from '../../hooks/use-collection';

/**
 *
 */
const CustomerSelectSearch = ({ onSelectCustomer, autoFocus = false, value }) => {
	const [opened, setOpened] = React.useState(false);
	const [selectedCustomer, setSelectedCustomer] = React.useState({ id: 0 });
	const pullDocument = usePullDocument();
	const { collection } = useCollection('customers');

	/**
	 *
	 */
	const query = React.useMemo(
		() =>
			new Query({
				sortBy: 'last_name',
				sortDirection: 'asc',
			}),
		[]
	);

	/**
	 *
	 */
	const onSearch = React.useCallback(
		(search) => {
			query.debouncedSearch(search);
		},
		[query]
	);

	// /**
	//  * HACK: get the selected customer from value and set it as selectedCustomer
	//  */
	// React.useEffect(() => {
	// 	async function getCustomer() {
	// 		try {
	// 			let selectedCustomer = await collection.findOneFix({ selector: { id: value } }).exec();
	// 			if (!selectedCustomer && value !== 0) {
	// 				selectedCustomer = await pullDocument(value, collection);
	// 			}
	// 			if (selectedCustomer) {
	// 				setSelectedCustomer(selectedCustomer);
	// 			}
	// 		} catch (error) {
	// 			log.error(error);
	// 		}
	// 	}

	// 	if (value) {
	// 		getCustomer();
	// 	}
	// }, [collection, pullDocument, value]);

	/**
	 *
	 */
	return (
		<Popover
			opened={opened}
			//onOpen={() => setOpened(true)}
			onClose={() => {
				/**
				 * If popover closes, go back to selected customer
				 */
				onSelectCustomer(selectedCustomer);
				setOpened(false);
			}}
			withArrow={false}
			matchWidth
			withinPortal={false}
		>
			<Popover.Target>
				<SearchInput
					// placeholder={placeholder}
					onSearch={onSearch}
					autoFocus={autoFocus}
					setOpened={setOpened}
					selectedCustomer={selectedCustomer}
				/>
			</Popover.Target>
			<Popover.Content style={{ paddingLeft: 0, paddingRight: 0, maxHeight: 300 }}>
				<CustomersProvider query={query}>
					<Suspense>
						<CustomerSelectMenu onChange={onSelectCustomer} />
					</Suspense>
				</CustomersProvider>
			</Popover.Content>
		</Popover>
	);
};

export default CustomerSelectSearch;
