import * as React from 'react';

import type { EngineRecord } from '@wcpos/query';

import { VariableProductTile as InlineTile } from '../../grid/variable-product-tile';
import { ProductTile } from './product-tile';
export function VariableProductTile({
	variationsStyle,
	onDrill,
	...props
}: React.ComponentProps<typeof InlineTile> & {
	variationsStyle: string;
	onDrill: (record: EngineRecord<'products'>) => void;
}) {
	return variationsStyle === 'inline' ? (
		<InlineTile {...props} />
	) : (
		<ProductTile {...props} onDrill={onDrill} />
	);
}
