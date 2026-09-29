import * as React from 'react';

import { Icon } from '@wcpos/components/icon';
import type { EngineRecord } from '@wcpos/query';

import { DataTableRow } from '../../../../components/data-table/v2/rows';
import { VariableProductRow as InlineRow } from '../../../../components/product/variable-product-row';
export function VariableProductRow({
	variationsStyle,
	onDrill,
	...props
}: React.ComponentProps<typeof InlineRow> & {
	variationsStyle: string;
	onDrill: (record: EngineRecord<'products'>) => void;
}) {
	if (variationsStyle === 'inline') return <InlineRow {...props} />;
	return (
		<DataTableRow
			item={props.item}
			onPress={() => onDrill(props.item.original.record)}
			trailing={<Icon name="chevronRight" />}
		/>
	);
}
