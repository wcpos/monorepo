import * as React from 'react';

import { CellContext } from '@tanstack/react-table';
import { useObservableEagerState } from 'observable-hooks';

import { Input } from '@wcpos/components/input';

import { useProAccess } from '../../contexts/pro-access';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export function Barcode({ row, table }: CellContext<{ document: ProductDocument }, 'name'>) {
	const product = row.original.document;
	const barcode = useObservableEagerState(product.barcode$!);
	const [value, setValue] = React.useState(barcode);
	const { readOnly } = useProAccess();
	const meta = table.options.meta as unknown as {
		onChange: (arg: { document: ProductDocument; changes: Record<string, unknown> }) => void;
	};

	/**
	 * Update value if prop changes
	 */
	React.useEffect(() => {
		setValue(barcode);
	}, [barcode]);

	/**
	 *
	 */
	const handleSubmit = React.useCallback(() => {
		if (readOnly) return;
		meta.onChange({ document: product, changes: { barcode: value } });
	}, [product, meta, value, readOnly]);

	/**
	 *
	 */
	return (
		<Input
			value={value}
			onChangeText={readOnly ? undefined : setValue}
			onBlur={handleSubmit}
			onSubmitEditing={handleSubmit}
			blurOnSubmit
			editable={!readOnly}
		/>
	);
}
