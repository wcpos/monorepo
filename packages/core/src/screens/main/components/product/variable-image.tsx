import * as React from 'react';
import { Pressable } from 'react-native';

import get from 'lodash/get';
import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { Image } from '@wcpos/components/image';

import { useImageAttachment } from '../../hooks/use-image-attachment';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export const VariableProductImage = ({
	row,
	table,
}: CellContext<{ document: ProductDocument }, 'image'>) => {
	const product = row.original.document;
	const images = useObservableEagerState(product.images$);
	const imageURL = get(images, [0, 'src'], undefined);
	const { uri } = useImageAttachment(product, imageURL);

	/**
	 * Use setRowExpanded from table meta to bypass TanStack's buggy updater function
	 */
	const setRowExpanded = table.options.meta?.setRowExpanded;
	const isExpanded = useObservableEagerState(
		table.options.meta.expanded$.pipe(map((expanded: Record<string, boolean>) => !!expanded[row.id]))
	);

	const handlePress = React.useCallback(() => {
		setRowExpanded?.(row.id, !isExpanded);
	}, [row.id, isExpanded, setRowExpanded]);

	return (
		<Pressable onPress={handlePress} className="h-20 w-full">
			<Image source={{ uri }} recyclingKey={product.uuid} className="h-full w-full rounded" />
		</Pressable>
	);
};
