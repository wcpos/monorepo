import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { CurrencyInput } from '../../components/currency-input';
import { CapabilityTooltip } from '../../components/capability-tooltip';
import { useProAccess } from '../../contexts/pro-access';
import { useUserCapabilities } from '../../hooks/use-user-capabilities';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;
type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

/**
 *
 */
export function EditablePrice({
	row,
	column,
	table,
}: CellContext<
	{ document: ProductDocument | ProductVariationDocument },
	'sale_price' | 'regular_price'
>) {
	const item = row.original.document;
	const price = useObservableEagerState(
		(item as unknown as Record<string, unknown>)[`${column.id}$`] as import('rxjs').Observable<
			string | undefined
		>
	) as string;
	const meta = table.options.meta as unknown as {
		onChange: (arg: {
			document: ProductDocument | ProductVariationDocument;
			changes: Record<string, unknown>;
		}) => void;
	};
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();
	const canEdit = item.type === 'variation' ? caps.canEditVariations : caps.canEditProducts;

	/**
	 *
	 */
	return (
		<CapabilityTooltip show={!readOnly && !canEdit} hint="editProducts">
			<CurrencyInput
				value={price}
				onChangeText={(price) =>
					meta.onChange({
						document: item,
						changes: { [column.id]: String(price) },
					})
				}
				disabled={readOnly || !canEdit || (column.id === 'sale_price' && !item.on_sale)}
			/>
		</CapabilityTooltip>
	);
}
