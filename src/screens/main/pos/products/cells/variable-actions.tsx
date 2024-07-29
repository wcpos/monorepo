import * as React from 'react';

import { Button } from '@wcpos/tailwind/src/button';
import { Icon } from '@wcpos/tailwind/src/icon';
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
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="ghost" className="rounded-full">
					<Icon name="circleChevronRight" className="fill-success w-7 h-7" />
				</Button>
			</PopoverTrigger>
			<PopoverContent side="right">
				<VariationsPopover parent={parent} addToCart={addToCart} />
			</PopoverContent>
		</Popover>
	);
};

export default VariableActions;
