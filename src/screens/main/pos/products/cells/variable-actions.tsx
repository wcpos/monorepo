import * as React from 'react';

import Icon from '@wcpos/components/src/icon';
import Popover from '@wcpos/components/src/popover';

import VariationsPopover from './variations-popover';
import { Query } from '../../../contexts/query';
import { VariationsProvider } from '../../../contexts/variations';
import useCartHelpers from '../../../hooks/use-cart-helpers';

interface VariableActionsProps {
	item: import('@wcpos/database').ProductDocument;
}

/**
 *
 */
const VariableActions = ({ item: parent }: VariableActionsProps) => {
	const [opened, setOpened] = React.useState(false);
	const { addVariation } = useCartHelpers();

	/**
	 *
	 */
	const query = React.useMemo(
		() =>
			new Query({
				selector: { id: { $in: parent.variations } },
			}),
		[
			parent.variations,
			opened, // reset query when popover is closed
		]
	);

	// /**
	//  *
	//  */
	const addToCart = React.useCallback(
		(variation, metaData) => {
			addVariation(variation, parent, metaData);
			// setOpened(false);
		},
		[addVariation, parent]
	);

	/**
	 *
	 */
	return (
		<Popover withinPortal opened={opened} onClose={() => setOpened(false)} placement="right">
			<Popover.Target>
				<Icon
					name="circleChevronRight"
					size="xxLarge"
					type="success"
					onPress={() => setOpened(true)}
				/>
			</Popover.Target>
			<Popover.Content>
				<VariationsProvider
					query={query}
					apiEndpoint={`products/${parent.id}/variations`}
					remoteIDs={parent.variations}
				>
					<VariationsPopover parent={parent} addToCart={addToCart} />
				</VariationsProvider>
			</Popover.Content>
		</Popover>
	);
};

export default VariableActions;
