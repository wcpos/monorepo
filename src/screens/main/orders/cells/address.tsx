import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { FormatAddress } from '@wcpos/components/src/format';

import type { CellContext } from '@tanstack/react-table';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
export const Address = ({
	row,
	column,
}: CellContext<{ document: OrderDocument }, 'billing' | 'shipping'>) => {
	const order = row.original.document;
	const address = useObservableEagerState(order[`${column.id}$`]);

	return address ? <FormatAddress address={address} showName={false} /> : null;
};
