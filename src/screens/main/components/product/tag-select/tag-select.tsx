import * as React from 'react';

import Popover from '@wcpos/components/src/popover';
import log from '@wcpos/utils/src/logger';

import TagSelectMenu from './menu';
import SearchInput from './search-input';
import { useProducts } from '../../../contexts/products';
import { Query } from '../../../contexts/query';
import { ProductTagsProvider } from '../../../contexts/tags';

type ProductTagDocument = import('@wcpos/database').ProductTagDocument;

/**
 *
 */
const TagSelectSearch = ({ onBlur }) => {
	const [opened, setOpened] = React.useState(false);
	const { query: productQuery } = useProducts();

	/**
	 *
	 */
	const tagQuery = React.useMemo(
		() =>
			new Query({
				// search: '',
				sortBy: 'name',
				sortDirection: 'asc',
				// limit: 10,
			}),
		[]
	);

	/**
	 *
	 */
	const onSearch = React.useCallback(
		(search) => {
			tagQuery.debouncedSearch(search);
		},
		[tagQuery]
	);

	/**
	 *
	 */
	const onSelectTag = React.useCallback(
		(tag: ProductTagDocument) => {
			productQuery.where('tags', { $elemMatch: { id: tag.id } });
		},
		[productQuery]
	);

	/**
	 *
	 */
	// const placeholder = React.useMemo(() => {
	// 	if (selectedTag) {
	// 		debugger;
	// 	}

	// 	return t('Search Tags', { _tags: 'core' });
	// }, [selectedTag]);

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
				<SearchInput setOpened={setOpened} onSearch={onSearch} onBlur={onBlur} />
			</Popover.Target>
			<Popover.Content style={{ paddingLeft: 0, paddingRight: 0, maxHeight: 300 }}>
				<ProductTagsProvider query={tagQuery}>
					<React.Suspense>
						<TagSelectMenu onChange={onSelectTag} />
					</React.Suspense>
				</ProductTagsProvider>
			</Popover.Content>
		</Popover>
	);
};

export default TagSelectSearch;
