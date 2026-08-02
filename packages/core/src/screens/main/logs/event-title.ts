import * as React from 'react';

import { isSyncEventType } from '@wcpos/utils/logger/generated/event-labels.generated';

import { useT } from '../../../contexts/translations';
import { translateEventTitle } from './generated/event-titles.generated';
import { eventTypeOf, type LogRow } from './logs-logic';

/**
 * Row title resolver (#912). A registered event type is translated NOW, in the
 * language the till runs today, rather than in whatever language wrote the row
 * months ago. Anything else — a non-engine row, or an event type from a newer
 * build than this UI — falls back to the persisted message, then to the raw
 * code, so nothing renders blank.
 *
 * The message fallback tests for text, not for presence: the sync observer
 * preserves `message: ''` rather than substituting, so `??` would hand the
 * ledger an empty title on exactly the rows the raw-code fallback exists for.
 */
export function useEventTitle(): (row: LogRow) => string {
	const t = useT();
	return React.useCallback(
		(row: LogRow) => {
			const type = eventTypeOf(row);
			if (type !== undefined && isSyncEventType(type)) {
				return translateEventTitle((key, options) => t(key, options), type);
			}
			if (typeof row.message === 'string' && row.message.trim() !== '') return row.message;
			return type ?? '';
		},
		[t]
	);
}
