import * as React from 'react';

import Popover from '@wcpos/components/src/popover';

import CategorySelectMenu from './query-wrapper';
import SearchInput from './search-input';

/**
 *
 */
const CategorySelectSearch = ({ onBlur, onSelect }) => {
	const [opened, setOpened] = React.useState(false);

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
				<SearchInput setOpened={setOpened} onBlur={onBlur} />
			</Popover.Target>
			<Popover.Content style={{ paddingLeft: 0, paddingRight: 0, maxHeight: 300 }}>
				<CategorySelectMenu onSelect={onSelect} />
			</Popover.Content>
		</Popover>
	);
};

export default CategorySelectSearch;
