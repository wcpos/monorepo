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
 * count is the session's, or the closure row's when the session has none, as are a note and
 * denominations an interrupted retry (#3302) left on it (a note it blanked shows the closure's
 * again, in the form). All are copied: a
 * document's nested field is an RxDB Proxy, and the storage worker cannot clone one.
 */
export function keptCount(
	session: {
		id: string;
		counted?: Count | null;
		count_note?: string | null;
		count_denominations?: { value: string; pieces: number }[] | null;
	},
	closure: { id: string; counted: Count; breakdowns?: Record<string, unknown> } | null
): CloseInput {
	const row = closure?.id === session.id ? closure : null;
	const counted = {
		...(Object.keys(session.counted ?? {}).length ? session.counted : row?.counted),
	};
	if (!row) return { counted };
	const denominations = session.count_denominations?.length
		? session.count_denominations
		: ((row.breakdowns?.denominations ?? []) as NonNullable<CloseInput['denominations']>);
	return {
		counted,
		note: session.count_note || String(row.breakdowns?.variance_note ?? ''),
		denominations: denominations.map(({ value, pieces }) => ({ value, pieces })),
	};
}

/**
 * The store refused this till's close (#2016): the count is kept. One line; the rest is in
 * Learn more (REGISTER211). Retry opens the count, so it is only offered where that is the way back.
 */
export function RefusedCloseNotice({
	onRetry,
	className,
}: {
	onRetry?: () => void;
	className?: string;
}) {
	const t = useT();
	return (
		<Notice
			tone="bad"
			testID="register-panel-refused-close"
			className={className}
			title={t('register.close_refused')}
			actions={
				onRetry
					? [{ label: t('register.retry'), testID: 'register-panel-retry-close', onPress: onRetry }]
					: undefined
			}
			docs={{ label: t('common.learn_more'), href: getErrorCodeDocURL('REGISTER211') }}
		/>
	);
}
