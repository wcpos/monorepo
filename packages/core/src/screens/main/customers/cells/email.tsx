import * as React from 'react';

import { Text } from '@wcpos/components/text';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

/**
 *
 */
export function CustomerEmail({
	row,
}: CellContext<{ record: EngineRecord<'customers'> }, 'email'>) {
	const email = useRecordField(row.original.record, ({ payload }) => payload.email);

	// Value-bearing testID: customer rows key their row testID on a client uuid
	// that server-side E2E probes cannot know in advance, so the email — which the
	// probe chooses — is the addressable anchor (E2E selector policy: testIDs, not
	// text narrowing).
	return (
		<Text testID={email ? `customer-email-${email}` : undefined} numberOfLines={1}>
			{email}
		</Text>
	);
}
