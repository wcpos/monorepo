import * as React from 'react';

import Icon from '@wcpos/components/src/icon';
import { Button } from '@wcpos/tailwind/src/button';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/tailwind/src/popover';

import VariationsPopover from './variations-popover';
import { useAddVariation } from '../../hooks/use-add-variation';

interface VariableActionsProps {
	item: import('@wcpos/database').ProductDocument;
}

/**
 *
 */
const VariableActions = ({ item: parent }: VariableActionsProps) => {
	const [opened, setOpened] = React.useState(false);
	const { addVariation } = useAddVariation();

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
		<Popover
		//withinPortal opened={opened} onClose={() => setOpened(false)} placement="right"
		>
			<PopoverTrigger>
				<Icon
					name="circleChevronRight"
					size="xxLarge"
					type="success"
					// onPress={() => setOpened(true)}
				/>
			</PopoverTrigger>
			<PopoverContent side="right">
				<VariationsPopover parent={parent} addToCart={addToCart} />
			</PopoverContent>
		</Popover>
	);
};

export default VariableActions;
