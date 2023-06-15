import * as React from 'react';

import Popover from '@wcpos/components/src/popover';
import log from '@wcpos/utils/src/logger';

import CustomerSelectMenu from './menu';
import SearchInput from './search-input';
import { t } from '../../../../lib/translations';
import { CustomersProvider } from '../../contexts/customers';
import usePullDocument from '../../contexts/use-pull-document';
import useCollection from '../../hooks/use-collection';

/**
 *
 */
const CustomerSelectSearch = ({ onSelectCustomer, autoFocus = false, value }) => {
	const [opened, setOpened] = React.useState(false);
	const customerSelectMenuRef = React.useRef(null);
	const [selectedCustomer, setSelectedCustomer] = React.useState({ id: 0 });
	const pullDocument = usePullDocument();
	const { collection } = useCollection('customers');

	/**
	 *
	 */
	const onSearch = React.useCallback((search) => {
		if (customerSelectMenuRef.current) {
			customerSelectMenuRef.current.onSearch(search);
		}
	}, []);

	/**
	 * HACK: get the selected customer from value and set it as selectedCustomer
	 */
	React.useEffect(() => {
		async function getCustomer() {
			try {
				let selectedCustomer = await collection.findOneFix({ selector: { id: value } }).exec();
				if (!selectedCustomer && value !== 0) {
					selectedCustomer = await pullDocument(value, collection);
				}
				if (selectedCustomer) {
					setSelectedCustomer(selectedCustomer);
				}
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
	const initialQuery = React.useMemo(
		() => ({
			// search: '',
			sortBy: 'last_name',
			sortDirection: 'asc',
			// limit: 10,
		}),
		[]
	);

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
				<CustomersProvider initialQuery={initialQuery}>
					<React.Suspense>
						<CustomerSelectMenu ref={customerSelectMenuRef} onChange={onSelectCustomer} />
					</React.Suspense>
				</CustomersProvider>
			</Popover.Content>
		</Popover>
	);
};

export default CustomerSelectSearch;
