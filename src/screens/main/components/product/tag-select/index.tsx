import * as React from 'react';

import Popover from '@wcpos/components/src/popover';

import TagSelectMenu from './query-wrapper';
import SearchInput from './search-input';
import { useStoreStateManager } from '../../../contexts/store-state-manager';

/**
 *
 */
const TagSelectSearch = ({ onBlur, onSelect }) => {
	const [opened, setOpened] = React.useState(false);
	const manager = useStoreStateManager();

	/**
	 *
	 */
	const onSearch = React.useCallback(
		(search) => {
			const query = manager.getQuery(['products/categories']);
			query.debouncedSearch(search);
		},
		[manager]
	);

	/**
	 *
	 */
	return (
		<Popover
			opened={opened}
			//onOpen={() => setOpened(true)}
			onClose={() => {
				setOpened(false);
				onSearch(''); // reset search
			}}
			withArrow={false}
			matchWidth
			withinPortal={false}
		>
			<Popover.Target>
				<SearchInput setOpened={setOpened} onBlur={onBlur} onSearch={onSearch} />
			</Popover.Target>
			<Popover.Content style={{ paddingLeft: 0, paddingRight: 0, maxHeight: 300 }}>
				<TagSelectMenu onSelect={onSelect} />
			</Popover.Content>
		</Popover>
	);
};

export default TagSelectSearch;
