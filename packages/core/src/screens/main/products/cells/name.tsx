import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { EditableName } from '../../components/editable-name';
import { PlainAttributes, ProductAttributes } from '../../components/product/attributes';
import { GroupedNames } from '../../components/product/grouped-names';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export function ProductName(props: CellContext<{ document: ProductDocument }, 'name'>) {
	const product = props.row.original.document;
	const show = props.column.columnDef.meta?.show;
	const name = useObservableEagerState(product.name$!);
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
				onChangeText={(name) => meta.onChange({ document: product, changes: { name } })}
			/>
			{show?.('sku') && <Text className="text-sm">{product.sku}</Text>}
			{show?.('barcode') && <Text className="text-sm">{product.barcode}</Text>}
			{show?.('attributes') && <PlainAttributes {...props} />}
			{product.type === 'variable' && <ProductAttributes {...props} />}
			{product.type === 'grouped' && <GroupedNames {...props} />}
		</VStack>
	);
}
