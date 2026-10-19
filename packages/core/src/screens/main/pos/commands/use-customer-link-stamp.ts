import * as React from 'react';

import type { MutationDocument, readOrderLinkState } from '@wcpos/query/mutations';

import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';

type LinkDocument = NonNullable<Awaited<ReturnType<typeof readOrderLinkState>>>['document'];

/** Keep the adapter's failed-write result and silent delete-superseded rethrow. */
export function useCustomerLinkStamp() {
	const { localPatch } = useLocalMutation();
	const stampCustomer = React.useCallback(
		(order: { document: unknown }, customerId: number) => {
			// localPatch resolves the current resident/template from this plain identity.
			const document = {
				...(order.document as LinkDocument),
				collection: { name: 'orders' },
			} as MutationDocument;
			return localPatch({ document, data: { customer_id: customerId } });
		},
		[localPatch]
	);
	return { stampCustomer };
}
