import * as React from 'react';

import { IconButton } from '@wcpos/components/icon-button';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/popover';
import type { EngineRecord } from '@wcpos/query';

import { VariationsPopover } from './variations-popover';
import { useAddVariation } from '../../hooks/use-add-variation';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;
type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];

/**
 *
 */
export function VariableActions({
	row,
}: CellContext<{ document: ProductDocument; record: EngineRecord<'products'> }, 'actions'>) {
	const parent = row.original.record;
	const { addVariation } = useAddVariation();
	const triggerRef = React.useRef<{ close: () => void } | null>(null);

	/**
	 *
	 */
	const addToCart = React.useCallback(
		async (variation: EngineRecord<'variations'>, metaData: LineItem['meta_data']) => {
			await addVariation(variation, parent, metaData as Parameters<typeof addVariation>[2]);
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
			<PopoverTrigger ref={triggerRef as React.RefObject<never>} asChild>
				<IconButton
					testID="variable-product-popover-button"
					name="circleChevronRight"
					variant="success"
					size="4xl"
				/>
			</PopoverTrigger>
			<PopoverContent side="right" className="w-auto max-w-80 p-2">
				<VariationsPopover parent={parent} addToCart={addToCart} />
			</PopoverContent>
		</Popover>
	);
}
