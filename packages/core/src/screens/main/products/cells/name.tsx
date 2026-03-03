import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { EditableName } from '../../components/editable-name';
import { PlainAttributes, ProductAttributes } from '../../components/product/attributes';
import { GroupedNames } from '../../components/product/grouped-names';
import { useProAccess } from '../../contexts/pro-access';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export function ProductName(props: CellContext<{ document: ProductDocument }, 'name'>) {
	const product = props.row.original.document;
	const show = props.column.columnDef.meta?.show;
	const name = useObservableEagerState(product.name$!);
	const { readOnly } = useProAccess();
	const meta = props.table.options.meta as unknown as {
		onChange: (arg: { document: ProductDocument; changes: Record<string, unknown> }) => void;
	};

	/**
	 *
	 */
	return (
		<VStack space="xs" className="w-full">
			<EditableName
				value={name}
				onChangeText={
					readOnly ? undefined : (name) => meta.onChange({ document: product, changes: { name } })
				}
				editable={!readOnly}
			/>
			{show?.('sku') && <Text className="text-sm">{product.sku}</Text>}
			{show?.('barcode') && <Text className="text-sm">{product.barcode}</Text>}
			{show?.('attributes') && <PlainAttributes {...props} />}
			{product.type === 'variable' && <ProductAttributes {...props} />}
			{product.type === 'grouped' && <GroupedNames {...props} />}
		</VStack>
	);
}
