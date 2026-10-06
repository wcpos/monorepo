import * as React from 'react';

import { VariableProductTile as InlineTile } from '../../grid/variable-product-tile';
import { DealStagedContext } from '../deal-stack';
import { ProductTile } from './product-tile';

// What a stage has out: the products stage stages the record itself; a browse level stages its
// product drill, `{ kind: 'product', record, … }` (or a term, which has neither).
type Staged = { uuid?: string; record?: { uuid?: string } } | null;

export function VariableProductTile({
	variationsStyle,
	onDrill,
	grow,
	...props
}: React.ComponentProps<typeof InlineTile> & {
	variationsStyle: string;
	onDrill: React.ComponentProps<typeof ProductTile>['onDrill'];
	grow?: boolean;
}) {
	const staged = React.useContext(DealStagedContext) as Staged;
	const stagedUuid = staged?.record ? staged.record.uuid : staged?.uuid;
	return variationsStyle === 'inline' ? (
		<InlineTile {...props} grow={grow} />
	) : (
		<ProductTile
			{...props}
			onDrill={onDrill}
			lifted={stagedUuid === props.record.uuid}
			grow={grow}
		/>
	);
}
