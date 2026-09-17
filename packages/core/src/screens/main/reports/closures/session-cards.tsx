import * as React from 'react';

import get from 'lodash/get';
import { defer, from, mergeMap } from 'rxjs';

import type { ClosureRow } from '@wcpos/database';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';

import { useRestHttpClient } from '../../hooks/use-rest-http-client';
import {
	RemoteSessionCard,
	SessionCard,
	type SessionCardData,
	type SessionSummary,
} from './session-card';

// Keep the all-register view from flooding the store with last-closure reads.
const LAST_CLOSURE_CONCURRENCY = 3;
// The sessions endpoint's maximum page size; a full page is not exhaustive history.
const SESSION_PAGE_SIZE = 100;
const loading: SessionCardData = { session: null, closure: null, status: 'loading' };

export function SessionCards({
	registers,
	storeId,
	localRegisterId,
}: {
	registers: { id: string; name: string }[];
	storeId?: number;
	localRegisterId?: string | null;
}) {
	const http = useRestHttpClient();
	const online = useOnlineStatus().status === 'online-website-available';
	const [cards, setCards] = React.useState<Record<string, SessionCardData>>({});
	const [attempt, retry] = React.useReducer((n: number) => n + 1, 0);
	const registerIds = registers.map((register) => register.id).join(',');
	// This keyed store view reads external summaries on activation/reconnect, not per card.
	React.useEffect(() => {
		if (!online || !registerIds) return;
		const ids = registerIds.split(',');
		const subscription = defer(async () => {
			setCards({});
			const sessions = new Map<string, SessionSummary>();
			let page = 1;
			let full: boolean;
			do {
				const { data } = await http.get('sessions', {
					params: { store_id: storeId || null, status: 'all', per_page: SESSION_PAGE_SIZE, page },
				});
				for (const session of data as SessionSummary[]) {
					// Pages are newest first: keep the first summary for each register.
					if (!sessions.has(session.register_id)) sessions.set(session.register_id, session);
				}
				full = data.length === SESSION_PAGE_SIZE;
				page++;
			} while (full && ids.some((id) => !sessions.has(id)));
			return sessions;
		})
			.pipe(
				mergeMap((sessions) => {
					return from(ids).pipe(
						mergeMap(async (id) => {
							const session = sessions.get(id);
							const card: SessionCardData = { ...loading, status: 'ready' };
							if (session && session.status !== 'closed') card.session = session;
							else {
								try {
									card.closure = (
										await http.get('closures/last', {
											params: { register_id: id, store_id: storeId || null },
										})
									).data as ClosureRow | null;
								} catch (error) {
									card.status = get(error, 'response.status') === 403 ? 'denied' : 'error';
								}
							}
							return { id, card };
						}, LAST_CLOSURE_CONCURRENCY)
					);
				})
			)
			.subscribe({
				next: ({ id, card }) => setCards((current) => ({ ...current, [id]: card })),
				error: (error) => {
					const status = get(error, 'response.status') === 403 ? 'denied' : 'error';
					setCards(Object.fromEntries(ids.map((id) => [id, { ...loading, status }])));
				},
			});
		return () => subscription.unsubscribe();
	}, [http, online, registerIds, storeId, attempt]);
	return (
		<>
			{registers.map((register) =>
				register.id === localRegisterId ? (
					<SessionCard key={register.id} summary={cards[register.id] ?? loading} reload={retry} />
				) : (
					<RemoteSessionCard
						key={register.id}
						register={register}
						storeId={storeId}
						summary={cards[register.id] ?? loading}
						reload={retry}
					/>
				)
			)}
		</>
	);
}
