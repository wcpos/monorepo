import Variations from './variations';
import { useQuery } from '../../../../../../contexts/store-state-manager';

/**
 * I need to quick of the query here
 */
const VariationsPopover = ({ parent, addToCart }) => {
	/**
	 *
	 */
	const query = useQuery({
		queryKeys: ['variations', { parentID: parent.id }],
		collectionName: 'variations',
		initialQuery: {
			selector: { id: { $in: parent.variations } },
		},
		apiEndpoint: `products/${parent.id}/variations`,
		remoteIDs: parent.variations,
	});

	return <Variations query={query} parent={parent} addToCart={addToCart} />;
};

export default VariationsPopover;
