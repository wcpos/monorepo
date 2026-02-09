import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { FormatAddress } from '@wcpos/components/format';

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
	const address = useObservableEagerState(
		(order as unknown as Record<string, import('rxjs').Observable<unknown>>)[`${column.id}$`]
	) as Record<string, string> | undefined;

	return address ? <FormatAddress address={address} showName={false} /> : null;
};
