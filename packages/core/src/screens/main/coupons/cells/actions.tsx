import * as React from 'react';

import { useRouter } from 'expo-router';

import { IconButton } from '@wcpos/components/icon-button';
import type { EngineRecord } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useT } from '../../../../contexts/translations';
import { CapabilityTooltip } from '../../components/capability-tooltip';
import { useProAccess } from '../../contexts/pro-access';
import { useUserCapabilities } from '../../hooks/use-user-capabilities';

// The orders caret (#2897): it opens the coupon like the row does. The cell sits beside the
// row's pressable (a button cannot nest in a button), so it needs its own. Sync and Delete
// live in the modal's footer.
export function Actions({ row }: CellContext<{ record: EngineRecord<'coupons'> }, 'actions'>) {
	const router = useRouter();
	const t = useT();
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();
	const editable = !readOnly && caps.canEditCoupons;
	return (
		<CapabilityTooltip show={!caps.canEditCoupons} hint="editCoupons">
			<IconButton
				testID="coupon-open-button"
				name="chevronRight"
				size="sm"
				variant="muted"
				accessibilityLabel={t('coupons.open_coupon', { _: 'Open coupon' })}
				disabled={!editable}
				onPress={() =>
					router.push({
						pathname: '/coupons/edit/[couponId]',
						params: { couponId: row.original.record.uuid },
					})
				}
			/>
		</CapabilityTooltip>
	);
}
