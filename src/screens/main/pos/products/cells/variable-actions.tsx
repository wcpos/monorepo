import * as React from 'react';

import { IconButton } from '@wcpos/components/src/icon-button';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/src/popover';

import VariationsPopover from './variations-popover';
import { useAddVariation } from '../../hooks/use-add-variation';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export const VariableActions = ({ row }: CellContext<ProductDocument, 'actions'>) => {
	const parent = row.original;
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
				<IconButton name="circleChevronRight" variant="success" size="4xl" />
			</PopoverTrigger>
			<PopoverContent side="right">
				<VariationsPopover parent={parent} addToCart={addToCart} />
			</PopoverContent>
		</Popover>
	);
};
