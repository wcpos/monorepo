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
	const [localData, setData] = React.useState<SessionCardData>({
		session: null,
		closure: null,
		status: 'idle',
	});
	const data = summary ?? localData;
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
			const session = lists.flatMap((result) => result.data as SessionSummary[])[0];
			const detail = await http.get(session ? `sessions/${session.id}` : 'closures/last', {
				params,
			});
			setData({
				session: session ? (detail.data as SessionSummary) : null,
				closure: session ? null : (detail.data as ClosureRow | null),
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
