import * as React from 'react';

import { useRouter } from 'expo-router';

import { IconButton } from '@wcpos/components/icon-button';
import type { EngineRecord } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useT } from '../../../../contexts/translations';
import { CapabilityTooltip } from '../../components/capability-tooltip';
import { useRowExpansion } from '../../components/product/variable-product-row/use-row-expansion';
import { useProAccess } from '../../contexts/pro-access';
import { useUserCapabilities } from '../../hooks/use-user-capabilities';

type Props = CellContext<{ record: EngineRecord<'products'> }, 'actions'>;

// The orders caret (#2897): it opens the product like the row does. The cell sits beside the
// row's pressable (a button cannot nest in a button), so it needs its own. Sync and Delete
// live in the modal's footer. A variable product's caret opens its variations instead.
export function Actions(props: Props) {
	return props.row.original.record.payload.type === 'variable' ? (
		<VariationsCaret {...props} />
	) : (
		<OpenCaret {...props} />
	);
}

function OpenCaret({ row }: Props) {
	const router = useRouter();
	const t = useT();
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();
	const editable = !readOnly && caps.canEditProducts;
	return (
		<CapabilityTooltip show={!caps.canEditProducts} hint="editProducts">
			<IconButton
				testID="product-open-button"
				name="chevronRight"
				size="sm"
				variant="muted"
				accessibilityLabel={t('products.open_product', { _: 'Open product' })}
				disabled={!editable}
				onPress={() =>
					router.push({
						pathname: '/(app)/(drawer)/products/(modals)/edit/product/[productId]',
						params: { productId: row.original.record.uuid },
					})
				}
			/>
		</CapabilityTooltip>
	);
}

// Showing variations edits nothing, so it takes no capability.
function VariationsCaret({ row, table }: Props) {
	const t = useT();
	const { expanded, toggle } = useRowExpansion(row, table);
	return (
		<IconButton
			testID="product-expand-button"
			name={expanded ? 'chevronDown' : 'chevronRight'}
			size="sm"
			variant="muted"
			aria-expanded={expanded}
			accessibilityLabel={t('products.show_variations', { _: 'Show variations' })}
			onPress={toggle}
		/>
	);
}
