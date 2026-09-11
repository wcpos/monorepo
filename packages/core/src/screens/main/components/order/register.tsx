import * as React from 'react';

import { ButtonPill } from '@wcpos/components/button';
import type { CellContext } from '@wcpos/core/table-types';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import { wooMetaCarrier } from '@wcpos/sync-core';

import { useRegisterNames } from '../../../../services/register/use-register-names';

import type { QueryStateActions } from '../../../../query';

export function Register({
	table,
	row,
}: CellContext<{ record: EngineRecord<'orders'> }, 'register'>) {
	const id = useRecordField(
		row.original.record,
		({ payload }) => wooMetaCarrier.readIdentity(payload.meta_data).registerId
	);
	const names = useRegisterNames();
	const actions = (
		table.options.meta as { actions?: Pick<QueryStateActions<'orders'>, 'setFilter'> }
	)?.actions;
	if (!id) return null;
	return (
		<ButtonPill
			testID="order-register"
			variant="ghost-secondary"
			size="xs"
			onPress={() => actions?.setFilter('register', id)}
		>
			{names[id] || id.slice(0, 8)}
		</ButtonPill>
	);
}
