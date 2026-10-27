import * as React from 'react';

import { useRouter } from 'expo-router';

import { IconButton } from '@wcpos/components/icon-button';
import type { EngineRecord } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useT } from '../../../../contexts/translations';
import { CapabilityTooltip } from '../../components/capability-tooltip';
import { useProAccess } from '../../contexts/pro-access';
import { useUserCapabilities } from '../../hooks/use-user-capabilities';

type Props = CellContext<{ record: EngineRecord<'products'> }, 'actions'>;

// The orders caret (#2897): on a fine pointer it is the one control that opens the product, a
// variable product's too (its variations open from the button under its name); the row is no
// press target (Paul, 2026-10-27). Sync and Delete live in the modal's footer.
export function Actions({ row }: Props) {
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
