import * as React from 'react';

import type { ProductPayload, ReadonlyEngineRecord, VariationPayload } from '@wcpos/query';

import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useMutation } from '../../hooks/mutations/use-mutation';

export function useCatalogueRecord() {
	const { localPatch } = useLocalMutation();
	const { patchRecord: productsPatch } = useMutation({ collectionName: 'products' });
	const { patchRecord: variationsPatch } = useMutation({ collectionName: 'variations' });
	const saveCatalogueFields = React.useCallback(
		async (
			record: ReadonlyEngineRecord<'products'> | ReadonlyEngineRecord<'variations'>,
			data: Partial<ProductPayload> | Partial<VariationPayload>
		): Promise<boolean> => !!(await localPatch({ document: record, data }))?.document,
		[localPatch]
	);
	const saveCatalogueChange = React.useCallback(
		(
			record: ReadonlyEngineRecord<'products'> | ReadonlyEngineRecord<'variations'>,
			changes: Record<string, unknown>
		) => {
			if (record.payload.type === 'variation') {
				return variationsPatch({ document: record, data: changes });
			}
			return productsPatch({ document: record, data: changes });
		},
		[productsPatch, variationsPatch]
	);
	return { saveCatalogueFields, saveCatalogueChange };
}
