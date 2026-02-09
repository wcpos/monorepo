import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { FormatAddress } from '@wcpos/components/format';
import type { FormatAddressProps } from '@wcpos/components/format/address';

import type { CellContext } from '@tanstack/react-table';

type CustomerDocument = import('@wcpos/database').CustomerDocument;

type AddressData = FormatAddressProps['address'];

export const Address = ({
	row,
	column,
}: CellContext<{ document: CustomerDocument }, 'billing' | 'shipping'>) => {
	const customer = row.original.document;
	const key = column.id as 'billing' | 'shipping';
	const obs$ = key === 'billing' ? customer.billing$ : customer.shipping$;
	// @ts-expect-error: RxDB observable type uses a different Observable brand than observable-hooks expects
	const address = useObservableEagerState(obs$) as AddressData | undefined;

	return <FormatAddress address={address ?? {}} showName={true} />;
};
