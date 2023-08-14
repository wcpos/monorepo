import Variations from './variations';
import { useQuery } from '../../../../../../contexts/store-state-manager';

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
		initialQuery: {
			selector: { id: { $in: parent.variations } },
			search: {},
		},
		parent,
	});

	return <Variations query={query} parent={parent} addToCart={addToCart} />;
};

export default VariationsPopover;
