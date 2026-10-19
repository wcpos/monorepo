import * as React from 'react';

import type { MetaDataEntry } from '@wcpos/order-math';
import type { MutationDocument } from '@wcpos/query/mutations';

import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';

/** Keep the adapter's call-time register stamp and failed-write result unchanged. */
export function useOrderLedgerWrite() {
	const { localPatch } = useLocalMutation();
	const recordLedger = React.useCallback(
		(
			order: MutationDocument,
			data: { meta_data: MetaDataEntry[]; status: string } | { fee_lines: object[]; total: string }
		) => localPatch({ document: order, data }),
		[localPatch]
	);
	const stampCompletion = React.useCallback(
		(order: MutationDocument, meta_data: MetaDataEntry[]) =>
			localPatch({ document: order, data: { meta_data } }),
		[localPatch]
	);
	return { recordLedger, stampCompletion };
}
