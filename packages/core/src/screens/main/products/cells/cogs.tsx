import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import get from 'lodash/get';

import { CurrencyInput } from '../../components/currency-input';
import { CapabilityTooltip } from '../../components/capability-tooltip';
import { useProAccess } from '../../contexts/pro-access';
import { useUserCapabilities } from '../../hooks/use-user-capabilities';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument =
	import('@wcpos/database').ProductDocument | import('@wcpos/database').ProductVariationDocument;

/**
 *
 */
export function COGS({
	table,
	row,
}: CellContext<{ document: ProductDocument }, 'cost_of_goods_sold'>) {
	const product = row.original.document;
	const cogs = useObservableEagerState(product.cost_of_goods_sold$!);
	const defined_value = get(cogs, ['values', 0, 'defined_value'], 0);
	const meta = table.options.meta as unknown as {
		onChange: (arg: { document: ProductDocument; changes: Record<string, unknown> }) => void;
	};
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();
	const canEdit = product.type === 'variation' ? caps.canEditVariations : caps.canEditProducts;

	/**
	 *
	 */
	return (
		<CapabilityTooltip show={!readOnly && !canEdit} hint="editProducts">
			<CurrencyInput
				value={defined_value}
				disabled={readOnly || !canEdit}
				onChangeText={(newValue) => {
					// Construct a plain object update (RxDB Proxy objects can't be cloned)
					const updatedCogs = {
						total_value: cogs?.total_value ?? 0,
						values: [
							{
								defined_value: newValue,
								effective_value: cogs?.values?.[0]?.effective_value ?? 0,
							},
						],
					};
					meta.onChange({
						document: product,
						changes: { cost_of_goods_sold: updatedCogs },
					});
				}}
			/>
		</CapabilityTooltip>
	);
}
