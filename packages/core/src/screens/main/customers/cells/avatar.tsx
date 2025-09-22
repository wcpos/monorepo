import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Image } from '@wcpos/components/image';

import { useImageAttachment } from '../../hooks/use-image-attachment';

import type { CellContext } from '@tanstack/react-table';

type CustomerDocument = import('@wcpos/database').CustomerDocument;

/**
 *
 */
export const Avatar = ({ row }: CellContext<{ document: CustomerDocument }, 'avatar_url'>) => {
	const customer = row.original.document;
	const avatarUrl = useObservableEagerState(customer.avatar_url$);
	const { uri } = useImageAttachment(customer, avatarUrl);

	return <Image source={{ uri }} className="h-10 w-10 rounded" recyclingKey={customer.uuid} />;
};
