import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import type { CellContext } from '@wcpos/tailwind/src/data-table';
import { FormatAddress } from '@wcpos/tailwind/src/format';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
export const Address = ({ row, column }: CellContext<OrderDocument, 'billing' | 'shipping'>) => {
	const order = row.original;
	const address = useObservableEagerState(order[`${column.id}$`]);

	return address ? <FormatAddress address={address} showName={false} /> : null;
};
