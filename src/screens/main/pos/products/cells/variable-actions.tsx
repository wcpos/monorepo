import * as React from 'react';

import Icon from '@wcpos/components/src/icon';
import Popover from '@wcpos/components/src/popover';

import VariationsPopover from './variations-popover';
import { Query } from '../../../contexts/query';
import { VariationsProvider } from '../../../contexts/variations';
import useCurrentOrder from '../../contexts/current-order';

interface VariableActionsProps {
	item: import('@wcpos/database').ProductDocument;
}

/**
 *
 */
const VariableActions = ({ item: parent }: VariableActionsProps) => {
	const [opened, setOpened] = React.useState(false);
	const { addVariation } = useCurrentOrder();

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
				<VariationsPopover parent={parent} addToCart={addToCart} />
			</Popover.Content>
		</Popover>
	);
};

export default VariableActions;
