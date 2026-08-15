import * as React from 'react';

import { useT } from '../../../contexts/translations';
import { relativeTimeParts } from './database-logic';

/** A ticking "now" so relative freshness copy stays current while a page is open. */
export function useNowMs(intervalMs: number): number {
	const [nowMs, setNowMs] = React.useState(() => Date.now());
	// Effect (last resort per project.mdc): wall-clock time has no reactive seam.
	React.useEffect(() => {
		const timer = setInterval(() => setNowMs(Date.now()), intervalMs);
		return () => clearInterval(timer);
	}, [intervalMs]);
	return nowMs;
}

/** Shared "6 seconds / 3 min / 2 h" formatter for the Store health tabs. */
export function useRelativeTime(): (fromMs: number, toMs: number) => string {
	const t = useT();
	return React.useCallback(
		(fromMs: number, toMs: number) => {
			const { unit, value } = relativeTimeParts(fromMs, toMs);
			if (unit === 'seconds') {
				return value < 5
					? t('health.database.just_now')
					: t('health.database.n_seconds', { n: value });
			}
			if (unit === 'minutes') {
				return t('health.database.n_minutes', { n: value });
			}
			return t('health.database.n_hours', { n: value });
		},
		[t]
	);
}
