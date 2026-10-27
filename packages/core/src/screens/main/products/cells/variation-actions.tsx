import * as React from 'react';

import { useRouter } from 'expo-router';

import { IconButton } from '@wcpos/components/icon-button';
import type { EngineRecord } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useT } from '../../../../contexts/translations';
import { CapabilityTooltip } from '../../components/capability-tooltip';
import { useProAccess } from '../../contexts/pro-access';
import { useUserCapabilities } from '../../hooks/use-user-capabilities';

// The product caret's twin for a variation row: it opens the variation's modal, where its
// Sync and Delete live.
export function VariationActions({
	row,
}: CellContext<{ record: EngineRecord<'variations'> }, 'actions'>) {
	const router = useRouter();
	const t = useT();
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();
	const editable = !readOnly && caps.canEditVariations;
	return (
		<CapabilityTooltip show={!caps.canEditVariations} hint="editVariations">
			<IconButton
				testID="variation-open-button"
				name="chevronRight"
				size="sm"
				accessibilityLabel={t('products.open_variation', { _: 'Open variation' })}
				disabled={!editable}
				onPress={() =>
					router.push({
						pathname: '/(app)/(drawer)/products/(modals)/edit/variation/[variationId]',
						params: { variationId: row.original.record.uuid },
					})
				}
			/>
		</CapabilityTooltip>
	);
}
