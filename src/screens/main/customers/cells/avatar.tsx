import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Image } from '@wcpos/components/src/image';

import { useImageAttachment } from '../../hooks/use-image-attachment';

import type { CellContext } from '@tanstack/react-table';

type CustomerDocument = import('@wcpos/database').CustomerDocument;

/**
 *
 */
export const Avatar = ({ row }: CellContext<{ document: CustomerDocument }, 'avatar_url'>) => {
	const customer = row.original.document;
	const avatarUrl = useObservableEagerState(customer.avatar_url$);
	const source = useImageAttachment(customer, avatarUrl);

	return <Image source={source} className="w-10 h-10 rounded" recyclingKey={customer.uuid} />;
};
