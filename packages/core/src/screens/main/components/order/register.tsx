import * as React from 'react';

import { Chip } from '@wcpos/components/chip';
import type { CellContext } from '@wcpos/core/table-types';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import { wooMetaCarrier } from '@wcpos/sync-core';

import { useRegisterNames } from '../../../../services/register/use-register-names';

export function Register({
	table,
	row,
}: CellContext<{ record: EngineRecord<'orders'> }, 'register'>) {
	const id = useRecordField(
		row.original.record,
		({ payload }) => wooMetaCarrier.readIdentity(payload.meta_data).registerId
	);
	const names = useRegisterNames();
	const actions = table.options.meta?.actions;
	if (!id) return null;
	return (
		<Chip
			testID="order-register"
			size="sm"
			label={names[id] || id.slice(0, 8)}
			onPress={() => actions?.setFilter('register', id)}
		/>
	);
}
