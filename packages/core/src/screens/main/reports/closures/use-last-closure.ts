import * as React from 'react';

import get from 'lodash/get';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import type { ClosureRow, RegisterSessionRow } from '@wcpos/database';

import { useT } from '../../../../contexts/translations';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';

export type SessionSummary = RegisterSessionRow & {
	expected?: Record<string, string>;
	sales_count?: number;
};
export type SessionCardData = {
	session: SessionSummary | null;
	closure: ClosureRow | null;
	status: string;
};

export function useLastClosure(
	register: { id: string; name: string } | undefined,
	storeId?: number,
	summary?: SessionCardData,
	generation?: string
) {
	const http = useRestHttpClient();
	const online = useOnlineStatus().status === 'online-website-available';
	const t = useT();
	// The state is keyed by its target (register and store): a result for another target, or
	// for a target that was disabled in between (the till open on this device, then closed
	// into a new closure), is stale and reads as idle, so the next enable loads afresh.
	// `generation` is the caller's word for "what I held is stale": the till strip passes its
	// local last closure's id, which changes whenever this device closes the till.
	const registerId = register?.id;
	const key = registerId ? `${registerId}:${storeId ?? ''}:${generation ?? ''}` : '';
	const idle = React.useMemo(
		(): SessionCardData & { key: string } => ({
			key,
			session: null,
			closure: null,
			status: 'idle',
		}),
		[key]
	);
	const [localData, setData] = React.useState<SessionCardData & { key: string }>(idle);
	const data = summary ?? (localData.key === key ? localData : idle);
	// Only the latest request may settle: a slow read overtaken by the next scheduled one
	// must not put the older answer over the newer.
	const latest = React.useRef(0);
	const load = React.useCallback(
		async (options?: { silent?: boolean }) => {
			if (!online || !registerId) return;
			const request = ++latest.current;
			// A response for a superseded target (or after a disable), or an overtaken request, is ignored.
			const settle = (next: Partial<SessionCardData>) =>
				setData((d) => (d.key === key && request === latest.current ? { ...d, ...next } : d));
			// A silent read keeps what it shows until the answer arrives (no loading state).
			if (!options?.silent) setData({ ...idle, status: 'loading' });
			try {
				const params = { register_id: registerId, store_id: storeId || null };
				const lists = await Promise.all(
					['open', 'counting'].map((status) =>
						http.get('sessions', { params: { ...params, status } })
					)
				);
				const listed = lists.flatMap((result) => result.data as SessionSummary[])[0];
				const detail = listed ? await http.get(`sessions/${listed.id}`, { params }) : undefined;
				// A session that closed between the list and its detail is not open any more.
				const session = detail?.data as SessionSummary | undefined;
				const stillOpen = !!session && (session.status === 'open' || session.status === 'counting');
				const last = stillOpen ? undefined : await http.get('closures/last', { params });
				settle({
					session: stillOpen ? session : null,
					closure: stillOpen ? null : ((last?.data as ClosureRow | null) ?? null),
					status: 'ready',
				});
			} catch (error) {
				// A failed silent read keeps what it held and the next scheduled read tries again,
				// unless access was refused: a 403 is not transient and must show as denied.
				const denied = get(error, 'response.status') === 403;
				if (options?.silent && !denied) return;
				settle({ status: denied ? 'denied' : 'error' });
			}
		},
		[http, online, registerId, storeId, key, idle]
	);
	// The scheduled re-read: silent over a ready result, a plain load otherwise (so a failed
	// or never-started lookup recovers on the next tick).
	const revalidate = React.useCallback(
		() => load({ silent: data.status === 'ready' }),
		[load, data.status]
	);
	const wasOnline = React.useRef(false);
	// External connectivity changes refresh stale remote cards; failures still use Retry.
	React.useEffect(() => {
		const reconnected = online && !wasOnline.current;
		wasOnline.current = online;
		// eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler -- Activation/reconnect reads external server state.
		if (!summary && (data.status === 'idle' || reconnected)) void load();
	}, [data.status, load, online, summary]);

	const unavailable = !online
		? t('reports.unavailable_offline')
		: data.status === 'ready'
			? undefined
			: t(
					data.status === 'denied'
						? 'reports.no_access'
						: data.status === 'error'
							? 'reports.load_failed'
							: 'common.loading'
				);
	return { data, online, load, revalidate, unavailable };
}
