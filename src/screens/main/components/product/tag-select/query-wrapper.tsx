import Suspense from '@wcpos/components/src/suspense';
import { useQuery } from '@wcpos/query';

import Menu from './menu';

/**
 * I need to kick off the query here
 */
const TagsQueryWrapper = (props) => {
	/**
	 *
	 */
	const query = useQuery({
		queryKeys: ['products/tags'],
		collectionName: 'products/tags',
		initialParams: {
			sortBy: 'name',
			sortDirection: 'asc',
		},
	});

	return (
		<Suspense>
			<Menu query={query} {...props} />
		</Suspense>
	);
};

export default TagsQueryWrapper;
