import * as React from 'react';

import { HStack } from '@wcpos/tailwind/src/hstack';
import { Icon } from '@wcpos/tailwind/src/icon';
import { Input } from '@wcpos/tailwind/src/input';

import { useT } from '../../../../../contexts/translations';

export const VariationSearchPill = ({ onSearch, parentSearchTerm }) => {
	const [search, setSearch] = React.useState('');
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
	return (
		<HStack>
			<Icon name="magnifyingGlass" />
			<Input
				placeholder={t('Search barcode', { _tags: 'core' })}
				value={search}
				onChangeText={handleSearch}
			/>
		</HStack>
	);

	/**
	 *
	 */
	// if (parentSearchTerm && !openSearch) {
	// 	return (
	// 		<Pill
	// 			size="small"
	// 			icon="magnifyingGlass"
	// 			removable
	// 			onPress={() => setOpenSearch(true)}
	// 			onRemove={() => {
	// 				onSearch('');
	// 				setOpenSearch(true);
	// 			}}
	// 		>
	// 			{parentSearchTerm}
	// 		</Pill>
	// 	);
	// }

	// return openSearch ? (
	// 	<TextInput
	// 		placeholder={t('Search Variations', { _tags: 'core' })}
	// 		value={search}
	// 		onChangeText={handleSearch}
	// 		containerStyle={{ width: 170 }}
	// 		size="small"
	// 		clearable
	// 		autoFocus
	// 	/>
	// ) : (
	// 	<Pill size="small" icon="magnifyingGlass" color="lightGrey" onPress={() => setOpenSearch(true)}>
	// 		{t('Search Variations', { _tags: 'core' })}
	// 	</Pill>
	// );
};
