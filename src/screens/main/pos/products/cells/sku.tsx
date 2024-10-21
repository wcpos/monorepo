import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/components/src/text';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export const SKU = ({ row }: CellContext<{ document: ProductDocument }, 'sku'>) => {
	const product = row.original.document;
	const sku = useObservableEagerState(product.sku$);

	return <Text>{sku}</Text>;
};
