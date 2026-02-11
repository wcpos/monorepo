import * as React from 'react';

import { IconButton } from '@wcpos/components/icon-button';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/popover';

import { VariationsPopover } from './variations-popover';
import { useAddVariation } from '../../hooks/use-add-variation';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;
type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

interface MetaData {
	attr_id: number;
	display_key?: string;
	display_value?: string;
}

/**
 *
 */
export function VariableActions({ row }: CellContext<{ document: ProductDocument }, 'actions'>) {
	const parent = row.original.document;
	const { addVariation } = useAddVariation();
	const triggerRef = React.useRef<{ close: () => void } | null>(null);

	/**
	 *
	 */
	const addToCart = React.useCallback(
		(variation: ProductVariationDocument | ProductDocument, metaData: MetaData[]) => {
			addVariation(variation as ProductVariationDocument, parent, metaData);
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
				<IconButton name="circleChevronRight" variant="success" size="xl" />
			</PopoverTrigger>
			<PopoverContent side="bottom" className="w-auto max-w-80 p-2">
				<VariationsPopover parent={parent} addToCart={addToCart as never} />
			</PopoverContent>
		</Popover>
	);
}
