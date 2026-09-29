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
	summary?: SessionCardData
) {
	const http = useRestHttpClient();
	const online = useOnlineStatus().status === 'online-website-available';
	const t = useT();
	const idle: SessionCardData = { session: null, closure: null, status: 'idle' };
	const [localData, setData] = React.useState<SessionCardData>(idle);
	const data = summary ?? localData;
	// While the lookup is disabled (the till is open on this device) whatever it held is stale:
	// the session it saw may since have closed into a new closure. Forget it, so the next
	// enable reads afresh instead of presenting the previous closure as authoritative.
	const disabled = !register;
	React.useEffect(() => {
		// eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler -- invalidates a server read when the caller disables it; nothing derives from props here.
		if (disabled) setData(idle);
	}, [disabled]);
	const load = React.useCallback(async () => {
		if (!online || !register) return;
		setData((d) => ({ ...d, status: 'loading' }));
		try {
			const params = { register_id: register.id, store_id: storeId || null };
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
			setData({
				session: stillOpen ? session : null,
				closure: stillOpen ? null : ((last?.data as ClosureRow | null) ?? null),
				status: 'ready',
			});
		} catch (error) {
			setData((d) => ({
				...d,
				status: get(error, 'response.status') === 403 ? 'denied' : 'error',
			}));
		}
	}, [http, online, register?.id, storeId]);
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
	return { data, online, load, unavailable };
}
