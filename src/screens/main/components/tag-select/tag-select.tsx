import * as React from 'react';

import Popover from '@wcpos/components/src/popover';
import log from '@wcpos/utils/src/logger';

import TagSelectMenu from './menu';
import SearchInput from './search-input';
import useProducts from '../../contexts/products';
import { ProductTagsProvider } from '../../contexts/tags';

type ProductTagDocument = import('@wcpos/database').ProductTagDocument;

/**
 *
 * @returns
 */
const TagSelectSearch = ({ onBlur }) => {
	const [opened, setOpened] = React.useState(false);
	const { setQuery: setProductsQuery } = useProducts();
	const tagSelectMenuRef = React.useRef(null);

	/**
	 *
	 */
	const onSearch = React.useCallback((search) => {
		if (tagSelectMenuRef.current) {
			tagSelectMenuRef.current.onSearch(search);
		}
	}, []);

	/**
	 *
	 */
	const onSelectTag = React.useCallback(
		(tag: ProductTagDocument) => {
			setProductsQuery('selector.tags.$elemMatch.id', tag.id);
		},
		[setProductsQuery]
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
	const initialQuery = React.useMemo(
		() => ({
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
				<ProductTagsProvider initialQuery={initialQuery}>
					<React.Suspense>
						<TagSelectMenu ref={tagSelectMenuRef} onChange={onSelectTag} />
					</React.Suspense>
				</ProductTagsProvider>
			</Popover.Content>
		</Popover>
	);
};

export default TagSelectSearch;
