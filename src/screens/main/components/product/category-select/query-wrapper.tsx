import Suspense from '@wcpos/components/src/suspense';

import Menu from './menu';
import { useQuery } from '../../../../../contexts/store-state-manager';

/**
 * I need to kick off the query here
 */
const CategoriesQueryWrapper = (props) => {
	/**
	 *
	 */
	const query = useQuery({
		queryKeys: ['products/categories'],
		collectionName: 'products/categories',
		initialQuery: {
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

export default CategoriesQueryWrapper;
