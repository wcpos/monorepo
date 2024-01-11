import * as React from 'react';

import Pill from '@wcpos/components/src/pill';
import TextInput from '@wcpos/components/src/textinput';

import { useT } from '../../../../../contexts/translations';

export const VariationSearchPill = ({ onSearch, parentSearchTerm }) => {
	const [search, setSearch] = React.useState('');
	const [openSearch, setOpenSearch] = React.useState(false);
	const t = useT();

	/**
	 *
	 */
	const handleSearch = React.useCallback(
		(search: string) => {
			setSearch(search);
			onSearch(search);
		},
		[onSearch]
	);

	/**
	 *
	 */
	if (parentSearchTerm && !openSearch) {
		return (
			<Pill
				size="small"
				icon="magnifyingGlass"
				removable
				onPress={() => setOpenSearch(true)}
				onRemove={() => {
					onSearch('');
					setOpenSearch(true);
				}}
			>
				{parentSearchTerm}
			</Pill>
		);
	}

	return openSearch ? (
		<TextInput
			placeholder={t('Search Variations', { _tags: 'core' })}
			value={search}
			onChangeText={handleSearch}
			containerStyle={{ width: 170 }}
			size="small"
			clearable
			autoFocus
		/>
	) : (
		<Pill size="small" icon="magnifyingGlass" color="lightGrey" onPress={() => setOpenSearch(true)}>
			{t('Search Variations', { _tags: 'core' })}
		</Pill>
	);
};
