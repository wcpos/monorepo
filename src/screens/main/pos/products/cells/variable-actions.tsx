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
export const VariableActions = ({ row }: CellContext<{ document: ProductDocument }, 'actions'>) => {
	const parent = row.original.document;
	const { addVariation } = useAddVariation();
	const triggerRef = React.useRef(null);

	/**
	 *
	 */
	const addToCart = React.useCallback(
		(variation, metaData) => {
			addVariation(variation, parent, metaData);
			if (triggerRef.current) {
				triggerRef.current.close();
			}
		},
		[addVariation, parent]
	);

	/**
	 *
	 */
	return (
		<Popover>
			<PopoverTrigger ref={triggerRef} asChild>
				<IconButton name="circleChevronRight" variant="success" size="4xl" />
			</PopoverTrigger>
			<PopoverContent side="right" className="w-auto max-w-80 p-2">
				<VariationsPopover parent={parent} addToCart={addToCart} />
			</PopoverContent>
		</Popover>
	);
};
