import * as React from 'react';

import { format, parseISO, subDays } from 'date-fns';
import { useObservableState } from 'observable-hooks';
import { map, of } from 'rxjs';
import get from 'lodash/get';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { HISTORY_DAYS } from '@wcpos/sync-core';
import { log } from '@wcpos/utils/logger';
import type { ClosureRow } from '@wcpos/database';

import { convertUTCStringToLocalDate } from '../../../../hooks/use-local-date';
import { useStoreSession } from '../../../../contexts/app-state';
import { useAppInfo } from '../../../../hooks/use-app-info';
import { useRegisterBinding } from '../../../../services/register/use-register-binding';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';
import { useStoreDay, zoneOptions } from '../../../../hooks/use-store-day';
import { useClosureCollection } from '../../../../services/register-session/use-register-session-collections';

export type ClosureScope = {
	from: string;
	to: string;
	registerId: string;
	storeId?: number;
	cashier?: number;
};
export function selectClosureRows(
	rows: readonly ClosureRow[],
	scope: ClosureScope,
	timezone: string
) {
	return rows
		.map((row) => ({
			...row,
			business_day:
				row.business_day ||
				format(convertUTCStringToLocalDate(row.opened_at), 'yyyy-MM-dd', zoneOptions(timezone)),
		}))
		.filter(
			(row) =>
				row.business_day >= scope.from &&
				row.business_day <= scope.to &&
				(!scope.registerId || row.register_id === scope.registerId) &&
				(row.store_id ?? 0) === (scope.storeId ?? 0) &&
				(scope.cashier === undefined || row.closed_by === scope.cashier)
		)
		.sort(
			(a, b) =>
				b.business_day.localeCompare(a.business_day) || b.closed_at.localeCompare(a.closed_at)
		);
}
function normalizeClosureRow(
	row: ClosureRow & { opened_at_gmt?: string; closed_at_gmt?: string }
): ClosureRow[] {
	const opened = row.opened_at_gmt ?? row.opened_at;
	const closed = row.closed_at_gmt ?? row.closed_at;
	if (!opened || !closed) return [];
	const openedAt = convertUTCStringToLocalDate(opened);
	const closedAt = convertUTCStringToLocalDate(closed);
	if (!Number.isFinite(openedAt.getTime()) || !Number.isFinite(closedAt.getTime())) return [];
	return [
		{
			...row,
			sync_status: 'synced' as const,
			opened_at: openedAt.toISOString(),
			closed_at: closedAt.toISOString(),
			counted: row.counted ?? {},
			variance: row.variance ?? {},
			synced_rows_at: row.closed_at_gmt ?? row.closed_at,
			breakdowns: {
				...row.breakdowns,
				...(row.breakdowns?.labels as Record<string, unknown>),
				store_name: get(row, 'breakdowns.store.name'),
			},
		},
	];
}
// Match the REST list default; a full final page costs one extra read, not a totals query.
const PAGE_SIZE = 50;
export function useClosureRows(requested: ClosureScope) {
	const { store } = useStoreSession();
	const binding = useRegisterBinding();
	const { license } = useAppInfo();
	const http = useRestHttpClient();
	const online = useOnlineStatus().status === 'online-website-available';
	const collection = useClosureCollection();
	const { timezone, presets } = useStoreDay(license?.isPro ? requested.storeId : store.id);
	const today = format(presets().today.from, 'yyyy-MM-dd', zoneOptions(timezone));
	const min = format(subDays(parseISO(today), HISTORY_DAYS), 'yyyy-MM-dd');
	const clamp = (day: string) => (day < min ? min : day > today ? today : day);
	const scope = license?.isPro
		? { ...requested, from: clamp(requested.from), to: clamp(requested.to) }
		: {
				from: today,
				to: today,
				registerId: binding.registerId ?? 'unbound',
				storeId: store.id,
				cashier: requested.cashier,
			};
	const key = JSON.stringify(scope);
	const [page, setPage] = React.useState({
		key,
		rows: [] as ClosureRow[],
		next: 1,
		more: true,
		status: 'idle',
	});
	if (page.key !== key) setPage({ key, rows: [], next: 1, more: true, status: 'idle' });
	const source = React.useMemo(
		() => (collection ? collection.find().$.pipe(map((rows) => ({ collection, rows }))) : of(null)),
		[collection]
	);
	const observed = useObservableState(source, null);
	const local = selectClosureRows(
		observed?.collection === collection
			? (observed?.rows.map((row) => row.toMutableJSON()) ?? [])
			: [],
		scope,
		timezone
	);
	const needsServer =
		!!license?.isPro &&
		(scope.storeId !== store.id || scope.registerId !== binding.registerId || scope.from < today);
	const loadMore = React.useCallback(async () => {
		if (!online || !needsServer || !page.more || ['loading', 'denied'].includes(page.status))
			return;
		setPage((p) => ({ ...p, status: 'loading' }));
		try {
			const { data } = await http.get('closures', {
				params: {
					register_id: scope.registerId || undefined,
					store_id: scope.storeId || null,
					after: scope.from,
					before: scope.to,
					page: page.next,
					per_page: PAGE_SIZE,
				},
			});
			const rows = (data as ClosureRow[]).flatMap(normalizeClosureRow);
			setPage((p) =>
				p.key !== key
					? p
					: {
							key,
							rows: [...p.rows, ...rows],
							next: page.next + 1,
							more: data.length === PAGE_SIZE,
							status: 'ready',
						}
			);
		} catch (error) {
			setPage((p) =>
				p.key !== key
					? p
					: { ...p, status: get(error, 'response.status') === 403 ? 'denied' : 'error' }
			);
		}
	}, [online, needsServer, page, key, http, scope.registerId, scope.storeId, scope.from, scope.to]);
	// Load the selected server scope once; failed reads and later pages are user-driven.
	React.useEffect(() => {
		// eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler -- Initial external read for the selected scope; retries are event-driven.
		if (observed && page.status === 'idle') void loadMore();
	}, [observed, page.status, loadMore]);
	const refreshRow = async (row: ClosureRow) => {
		const identity = (r: ClosureRow) => r.server_closure_id ?? r.id;
		const update = async (updated: ClosureRow) => {
			// The refresh overlays the server's current fields on the viewed row and keeps its
			// identity, so the open panel's selection (a local uuid for a closure this device
			// wrote) still resolves and a field the detail response omits cannot drop the row.
			const next = {
				...row,
				...updated,
				id: row.id,
				server_closure_id: row.server_closure_id ?? updated.server_closure_id,
			};
			setPage((p) =>
				p.key === key
					? {
							...p,
							rows: [
								...p.rows.filter((r) => r.id !== next.id && identity(r) !== identity(next)),
								next,
							],
						}
					: p
			);
			const local = await collection?.findOne(row.id).exec();
			await local?.incrementalPatch({ corrections_count: updated.corrections_count });
		};
		try {
			await update({ ...row, corrections_count: (row.corrections_count ?? 0) + 1 });
			const { data } = await http.get(`closures/${row.server_closure_id ?? row.id}`);
			const refreshed = normalizeClosureRow(data)[0];
			if (refreshed) await update(refreshed);
		} catch (error) {
			log.warn('Closure row refresh failed', { context: { error: String(error) } });
		}
	};
	const merged = new Map(page.rows.map((row) => [row.server_closure_id ?? row.id, row]));
	for (const row of local) {
		const pending = !row.synced_rows_at || ['pending', 'failed'].includes(row.sync_status);
		const id = row.server_closure_id ?? row.id;
		if (!merged.has(id) || pending) merged.set(id, row);
	}
	const rows = selectClosureRows([...merged.values()], scope, timezone);
	const localIds = new Set(local.map((row) => row.id));
	return {
		scope,
		rows,
		loadMore,
		refreshRow,
		hasMore: needsServer && page.more && page.status === 'ready',
		unavailableIds: new Set(
			online ? [] : rows.filter((row) => !localIds.has(row.id)).map((row) => row.id)
		),
		status: needsServer
			? !online
				? 'unavailable'
				: page.status === 'idle'
					? 'loading'
					: page.status
			: observed
				? 'ready'
				: 'loading',
	};
}
