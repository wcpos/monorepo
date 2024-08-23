import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { FormatAddress } from '@wcpos/tailwind/src/format';

import type { CellContext } from '@tanstack/react-table';

type CustomerDocument = import('@wcpos/database').CustomerDocument;

/**
 *
 */
export const Address = ({ row, column }: CellContext<CustomerDocument, 'billing' | 'shipping'>) => {
	const customer = row.original;
	const address = useObservableEagerState(customer[`${column.id}$`]);

	return <FormatAddress address={address} showName={true} />;
};
