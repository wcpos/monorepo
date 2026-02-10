import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { of } from 'rxjs';

import { Image } from '@wcpos/components/image';

import { useImageAttachment } from '../../hooks/use-image-attachment';

import type { CellContext } from '@tanstack/react-table';

type CustomerDocument = import('@wcpos/database').CustomerDocument;

/**
 *
 */
export function Avatar({ row }: CellContext<{ document: CustomerDocument }, 'avatar_url'>) {
	const customer = row.original.document;
	const avatarUrl = useObservableEagerState(
		customer.avatar_url$ ?? of(undefined as string | undefined)
	);
	const { uri } = useImageAttachment(customer, avatarUrl ?? '');

	return <Image source={{ uri }} className="h-10 w-10 rounded" recyclingKey={customer.uuid} />;
}
