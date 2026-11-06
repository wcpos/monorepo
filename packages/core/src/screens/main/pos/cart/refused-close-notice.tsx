import * as React from 'react';

import { Notice } from '@wcpos/components/notice';
import { getErrorCodeDocURL } from '@wcpos/utils/logger/constants';

import { useT } from '../../../../contexts/translations';

type Count = Record<string, string>;
type CloseInput = {
	counted: Count;
	note?: string;
	denominations?: { value: string; pieces: number }[];
};

/**
 * The count a refused close kept (#2016). The store's row empties the session's note and
 * denominations, and back to selling clears them, so those come from the closure row; the
 * count is the session's, or the closure row's when the session has none. Both are copied: a
 * document's nested field is an RxDB Proxy, and the storage worker cannot clone one.
 */
export function keptCount(
	session: { id: string; counted?: Count | null },
	closure: { id: string; counted: Count; breakdowns?: Record<string, unknown> } | null
): CloseInput {
	const row = closure?.id === session.id ? closure : null;
	const counted = {
		...(Object.keys(session.counted ?? {}).length ? session.counted : row?.counted),
	};
	if (!row) return { counted };
	const denominations = (row.breakdowns?.denominations ?? []) as CloseInput['denominations'];
	return {
		counted,
		note: String(row.breakdowns?.variance_note ?? ''),
		denominations: denominations!.map(({ value, pieces }) => ({ value, pieces })),
	};
}

/** The store refused this till's close: the count is kept, and Retry sends the same close. */
export function RefusedCloseNotice({
	session,
	closure,
	closeSession,
	attempt,
	className,
}: {
	session: Parameters<typeof keptCount>[0];
	closure: Parameters<typeof keptCount>[1];
	closeSession: (input: CloseInput) => Promise<unknown>;
	/** The pane's own error surface, so a failed retry reads as any failed action there. */
	attempt: (action: () => Promise<unknown>) => Promise<unknown>;
	className?: string;
}) {
	const t = useT();
	return (
		<Notice
			tone="bad"
			testID="register-panel-refused-close"
			className={className}
			title={t('register.close_refused')}
			actions={[
				{
					label: t('register.retry'),
					testID: 'register-panel-retry-close',
					onPress: () => void attempt(() => closeSession(keptCount(session, closure))),
				},
			]}
			docs={{ label: t('common.learn_more'), href: getErrorCodeDocURL('REGISTER211') }}
		/>
	);
}
