import { useQuery } from '@wcpos/query';

import Variations from './variations';

/**
 *
 */
const VariationsPopover = ({ parent, addToCart }) => {
	/**
	 *
	 */
	const query = useQuery({
		queryKeys: ['variations', { parentID: parent.id }],
		collectionName: 'variations',
		initialParams: {
			selector: { id: { $in: parent.variations } },
		},
		endpoint: `products/${parent.id}/variations`,
		greedy: true,
	});

	return <Variations query={query} parent={parent} addToCart={addToCart} />;
};

export default VariationsPopover;
