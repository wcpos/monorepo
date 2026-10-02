import * as React from 'react';

import type { EngineRecord } from '@wcpos/query';

import { VariableProductTile as InlineTile } from '../../grid/variable-product-tile';
import { DealStagedContext } from '../deal-stack';
import { ProductTile } from './product-tile';
export function VariableProductTile({
	variationsStyle,
	onDrill,
	...props
}: React.ComponentProps<typeof InlineTile> & {
	variationsStyle: string;
	onDrill: React.ComponentProps<typeof ProductTile>['onDrill'];
}) {
	const staged = React.useContext(DealStagedContext) as EngineRecord<'products'> | null;
	return variationsStyle === 'inline' ? (
		<InlineTile {...props} />
	) : (
		<ProductTile {...props} onDrill={onDrill} lifted={staged?.uuid === props.record.uuid} />
	);
}
