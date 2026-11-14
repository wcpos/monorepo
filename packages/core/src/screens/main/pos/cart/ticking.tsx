import * as React from 'react';

import { useNowMs } from '../../../../hooks/use-relative-time';

/** Re-renders its child every `everyMs` with a fresh now; the parent never ticks. */
export function Ticking({
	everyMs = 60_000,
	children,
}: {
	everyMs?: number;
	children: (nowMs: number) => React.ReactNode;
}) {
	const nowMs = useNowMs(everyMs);
	return <>{children(nowMs)}</>;
}
