import * as React from 'react';

import { useQuery } from '@wcpos/query';
import { Command, CommandInput, CommandEmpty } from '@wcpos/tailwind/src/command';
import { Suspense } from '@wcpos/tailwind/src/suspense';

import { CategoryList } from './list';
import { useT } from '../../../../../contexts/translations';

/**
 *
 */
export const CategorySearch = ({ onSelect }) => {
	const t = useT();
	const [search, setSearch] = React.useState('');

	/**
	 *
	 */
	const query = useQuery({
		queryKeys: ['products/categories'],
		collectionName: 'products/categories',
		initialParams: {
			sortBy: 'name',
			sortDirection: 'asc',
		},
	});

	/**
	 *
	 */
	const onSearch = React.useCallback(
		(value: string) => {
			setSearch(value);
			query.debouncedSearch(value);
		},
		[query]
	);

	/**
	 *
	 */
	return (
		<Command shouldFilter={false}>
			<CommandInput
				placeholder={t('Search Categories', { _tags: 'core' })}
				value={search}
				onValueChange={onSearch}
			/>
			<CommandEmpty>{t('No category found', { _tags: 'core' })}</CommandEmpty>
			<Suspense>
				<CategoryList query={query} onSelect={onSelect} />
			</Suspense>
		</Command>
	);
};
