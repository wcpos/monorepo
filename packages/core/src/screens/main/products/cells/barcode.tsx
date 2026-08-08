import * as React from 'react';

import { CellContext } from '@tanstack/react-table';
import { useObservableEagerState } from 'observable-hooks';

import { Input } from '@wcpos/components/input';

import { CapabilityTooltip } from '../../components/capability-tooltip';
import { useProAccess } from '../../contexts/pro-access';
import { useUserCapabilities } from '../../hooks/use-user-capabilities';

type ProductDocument =
	import('@wcpos/database').ProductDocument | import('@wcpos/database').ProductVariationDocument;

/**
 *
 */
export function Barcode({ row, table }: CellContext<{ document: ProductDocument }, 'name'>) {
	const product = row.original.document;
	const barcode = useObservableEagerState(product.barcode$!);
	const [value, setValue] = React.useState(barcode);
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();
	const canEdit = product.type === 'variation' ? caps.canEditVariations : caps.canEditProducts;
	const disabled = readOnly || !canEdit;
	const meta = table.options.meta as unknown as {
		onChange: (arg: { document: ProductDocument; changes: Record<string, unknown> }) => void;
	};

	// Update value if the underlying barcode changes. Implemented as the React
	// "adjust state during render" pattern (tracking the previous barcode) rather
	// than an effect, so it never sets state inside useEffect.
	const [prevBarcode, setPrevBarcode] = React.useState(barcode);
	if (barcode !== prevBarcode) {
		setPrevBarcode(barcode);
		setValue(barcode);
	}

	/**
	 *
	 */
	const handleSubmit = React.useCallback(() => {
		if (disabled) return;
		meta.onChange({ document: product, changes: { barcode: value } });
	}, [product, meta, value, disabled]);

	/**
	 *
	 */
	return (
		<CapabilityTooltip show={!readOnly && !canEdit} hint="editProducts">
			<Input
				value={value}
				onChangeText={disabled ? undefined : setValue}
				onBlur={handleSubmit}
				onSubmitEditing={handleSubmit}
				blurOnSubmit
				editable={!disabled}
			/>
		</CapabilityTooltip>
	);
}
