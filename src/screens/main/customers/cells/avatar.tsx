import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import type { CellContext } from '@wcpos/tailwind/src/data-table';
import { Image } from '@wcpos/tailwind/src/image';

import { useImageAttachment } from '../../hooks/use-image-attachment';

type CustomerDocument = import('@wcpos/database').CustomerDocument;

/**
 *
 */
export const Avatar = ({ row }: CellContext<CustomerDocument, 'avatar_url'>) => {
	const customer = row.original;
	const avatarUrl = useObservableEagerState(customer.avatar_url$);
	const source = useImageAttachment(customer, avatarUrl);

	return <Image source={source} className="w-10 h-10 rounded" recyclingKey={customer.uuid} />;
};
