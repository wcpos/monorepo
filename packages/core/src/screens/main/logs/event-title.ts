import * as React from 'react';

import {
	ERROR_CATALOGUE,
	type ErrorCode,
} from '@wcpos/utils/logger/generated/error-codes.generated';
import { isSyncEventType } from '@wcpos/utils/logger/generated/event-labels.generated';

import { useT } from '../../../contexts/translations';
import { translateErrorSummary } from './generated/error-summaries.generated';
import { translateEventTitle } from './generated/event-titles.generated';
import { eventTypeOf, type LogRow } from './logs-logic';

/**
 * Row title resolver (#912). A registered event type is translated NOW, in the
 * language the till runs today, rather than in whatever language wrote the row
 * months ago. A row with no event type but a registered error code — the
 * `logger.error('Checkout failed', { code })` call sites across packages/core —
 * is titled from that code's catalogue summary, the same translated sentence
 * the detail pane leads with, rather than the developer's English message
 * (#2439: a Dutch till showed "Checkout failed" between translated rows).
 * Anything else — a non-engine row, or an event type or code from a newer build
 * than this UI — falls back to the persisted message, then to the raw code, so
 * nothing renders blank. An UNREGISTERED event type takes that fallback even
 * when the row also carries a known code: the newer engine's own narration
 * beats a generic summary.
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
				return translateEventTitle((key) => t(key), type);
			}
			if (type === undefined && typeof row.code === 'string' && row.code in ERROR_CATALOGUE) {
				return translateErrorSummary((key) => t(key), row.code as ErrorCode);
			}
			if (typeof row.message === 'string' && row.message.trim() !== '') return row.message;
			return type ?? '';
		},
		[t]
	);
}
