import * as React from 'react';

import { format } from 'date-fns/format';
import { parseISO } from 'date-fns/parseISO';
import { subDays } from 'date-fns/subDays';
import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs';
import get from 'lodash/get';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { HISTORY_DAYS } from '@wcpos/sync-core';
import { log } from '@wcpos/utils/logger';
import { type ClosureRow, observeClosures, refreshClosureRow } from '@wcpos/query/register-session';

import { convertUTCStringToLocalDate } from '../../../../hooks/use-local-date';
import { useStoreSession } from '../../../../contexts/app-state';
import { useAppInfo } from '../../../../hooks/use-app-info';
import { useRegisterBinding } from '../../../../services/register/use-register-binding';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';
import { useStoreDay, zoneOptions } from '../../../../hooks/use-store-day';

export type ClosureScope = {
	from: string;
	to: string;
	registerId: string;
	storeId?: number;
	cashier?: number;
};
export function clampClosureScope(scope: ClosureScope, today: string): ClosureScope {
	const min = format(subDays(parseISO(today), HISTORY_DAYS), 'yyyy-MM-dd');
	const clamp = (day: string) => (day < min ? min : day > today ? today : day);
	return { ...scope, from: clamp(scope.from), to: clamp(scope.to) };
}
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
/** A server closure into the local row shape: GMT stamps, absent maps, flattened labels. */
export function normalizeClosureRow(
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
	const { store, storeDB } = useStoreSession();
	const binding = useRegisterBinding();
	const { license } = useAppInfo();
	const http = useRestHttpClient();
	const online = useOnlineStatus().status === 'online-website-available';
	const { timezone, presets } = useStoreDay(license?.isPro ? requested.storeId : store.id);
	const today = format(presets().today.from, 'yyyy-MM-dd', zoneOptions(timezone));
	const scope = license?.isPro
		? clampClosureScope(requested, today)
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
		target: 0,
		more: true,
		status: 'idle',
	});
	const [wasOnline, setWasOnline] = React.useState(online);
	if (wasOnline !== online) setWasOnline(online);
	if (page.key !== key || (online && !wasOnline))
		setPage({ key, rows: [], next: 1, target: 0, more: true, status: 'idle' });
	const source = React.useMemo(
		() => observeClosures(storeDB).pipe(map((rows) => (rows === null ? null : { storeDB, rows }))),
		[storeDB]
	);
	const observed = useObservableState(source, null);
	const local = selectClosureRows(
		observed?.storeDB === storeDB ? (observed?.rows ?? []) : [],
		scope,
		timezone
	);
	const merged = new Map(page.rows.map((row) => [row.server_closure_id ?? row.id, row]));
	for (const row of local) {
		const pending = !row.synced_rows_at || ['pending', 'failed'].includes(row.sync_status);
		const id = row.server_closure_id ?? row.id;
		const server = merged.get(id);
		if (!server || pending) merged.set(id, row);
		else {
			// Keep device-only document data without replacing authoritative server figures.
			merged.set(id, {
				...server,
				receipt_snapshot: row.receipt_snapshot,
				printed_number: row.printed_number,
				// The print mark is this device's: a server page knows nothing of its reprints.
				print_count: Math.max(server.print_count ?? 0, row.print_count ?? 0),
				printed_at: row.printed_at ?? server.printed_at,
			});
		}
	}
	const rows = selectClosureRows([...merged.values()], scope, timezone);
	const fillCashierPage =
		scope.cashier !== undefined &&
		rows.length < page.target &&
		page.more &&
		page.status === 'ready';
	const needsServer = !!license?.isPro;
	const loadMore = React.useCallback(async () => {
		if (!online || !needsServer || !page.more || ['loading', 'denied'].includes(page.status))
			return;
		setPage((p) => ({
			...p,
			status: 'loading',
			// Continuation belongs to the same load; only a new load sets a new target.
			target: fillCashierPage ? p.target : rows.length + PAGE_SIZE,
		}));
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
							...p,
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
	}, [
		online,
		needsServer,
		page,
		key,
		http,
		scope.registerId,
		scope.storeId,
		scope.from,
		scope.to,
		fillCashierPage,
		rows.length,
	]);
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
			// A failed local patch must not stop the authoritative detail read that follows.
			try {
				await refreshClosureRow(storeDB, identity(row), updated.corrections_count);
			} catch (error) {
				log.warn('Closure row could not be patched locally', { context: { error: String(error) } });
			}
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
	// The REST API cannot filter cashiers; fill the filtered page before ending loading.
	React.useEffect(() => {
		// eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler -- External scope read and filtered-page continuation; failed reads remain user-driven.
		if (observed && (page.status === 'idle' || fillCashierPage)) void loadMore();
	}, [observed, page.status, fillCashierPage, loadMore]);
	const localIds = new Set(local.map((row) => row.server_closure_id ?? row.id));
	return {
		scope,
		rows,
		localRows: local,
		loadMore,
		refreshRow,
		hasMore: needsServer && page.more && page.status === 'ready' && !fillCashierPage,
		unavailableIds: new Set(
			online
				? []
				: rows
						.filter((row) => !localIds.has(row.server_closure_id ?? row.id))
						.map((row) => row.server_closure_id ?? row.id)
		),
		status: needsServer
			? !online
				? 'unavailable'
				: page.status === 'idle' || fillCashierPage
					? 'loading'
					: page.status
			: observed
				? 'ready'
				: 'loading',
	};
}
