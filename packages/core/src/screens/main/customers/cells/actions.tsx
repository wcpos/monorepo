import * as React from 'react';

import { useRouter } from 'expo-router';

import { IconButton } from '@wcpos/components/icon-button';
import type { ReadonlyEngineRecord } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useT } from '../../../../contexts/translations';
import { CapabilityTooltip } from '../../components/capability-tooltip';
import { useProAccess } from '../../contexts/pro-access';
import { useUserCapabilities } from '../../hooks/use-user-capabilities';

// The orders caret (#2897): it opens the customer like the row does. The cell sits beside the
// row's pressable (a button cannot nest in a button), so it needs its own. Sync and Delete
// live in the modal's footer.
export function Actions({
	row,
}: CellContext<{ record: ReadonlyEngineRecord<'customers'> }, 'actions'>) {
	const router = useRouter();
	const t = useT();
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();
	const editable = !readOnly && caps.canEditCustomers;
	return (
		<CapabilityTooltip show={!caps.canEditCustomers} hint="editCustomers">
			<IconButton
				testID="customer-open-button"
				name="chevronRight"
				size="sm"
				variant="muted"
				accessibilityLabel={t('customers.open_customer', { _: 'Open customer' })}
				disabled={!editable}
				onPress={() =>
					router.push({
						pathname: '/customers/edit/[customerId]',
						params: { customerId: row.original.record.uuid },
					})
				}
			/>
		</CapabilityTooltip>
	);
}
