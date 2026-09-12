import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { combineLatest, map, of, switchMap, timer } from 'rxjs';

import { observeEngineQuery, useDocField, useQueryRuntime } from '@wcpos/query';
import { readLedger } from '@wcpos/order-math';

import { useStoreSession } from '../../contexts/app-state';
import { useRegisterBinding } from '../register/use-register-binding';
import { deriveExpected } from './expected';
import * as actions from './session-store';
import {
	useCashMovementCollection,
	useClosureCollection,
	useRegisterSessionCollection,
} from './use-register-session-collections';

export function useRegisterSession() {
	const { store, wpCredentials, userDB, site } = useStoreSession();
	const { engine, locale } = useQueryRuntime();
	const binding = useRegisterBinding();
	const sessions = useRegisterSessionCollection();
	const movements = useCashMovementCollection();
	const closures = useClosureCollection();
	const sessionsOn = !!useDocField(store, (value) => value.register_sessions);
	const varianceThreshold = useDocField(store, (value) => value.variance_threshold);
	const closeTime = useDocField(store, (value) => value.expected_close_time);
	const capabilities = useDocField(wpCredentials, (value) => value.capabilities);
	const source = React.useMemo(() => {
		if (!sessions || !movements || !closures || !binding.registerId || !sessionsOn) return of(null);
		const active$ = sessions.find({
			selector: { register_id: binding.registerId, status: { $in: ['open', 'counting'] } },
		}).$;
		const closed$ = sessions.find({
			selector: { register_id: binding.registerId, status: 'closed' },
		}).$;
		// An older order can be paid in this session too, so the bound is the modified date,
		// not the birth date; ledger provenance then binds it.
		const orders$ = combineLatest([active$, closed$]).pipe(
			switchMap(([active, closed]) => {
				const current =
					active.find((row) => row.sync_status !== 'failed') ??
					closed.find((row) => row.closure_id === row.id && row.sync_status !== 'synced');
				if (!current) return of({ hits: [] as never[] });
				return observeEngineQuery(engine, locale, {
					collection: 'orders',
					selector: { date_modified_gmt: { $gte: current.opened_at_gmt } },
					limit: Number.MAX_SAFE_INTEGER,
				});
			})
		);
		return combineLatest([
			active$,
			closed$,
			movements.find().$,
			orders$,
			timer(0, 60_000),
			closures.find({ selector: { register_id: binding.registerId } }).$,
		]).pipe(
			map(([active, closed, entries, orders, , closureRows]) => ({
				sessions,
				registerId: binding.registerId,
				active,
				closed,
				entries,
				orders,
				closureRows,
			}))
		);
	}, [sessions, movements, closures, binding.registerId, sessionsOn, engine, locale]);
	const observed = useObservableState(source, null);
	const data =
		observed?.sessions === sessions && observed?.registerId === binding.registerId && sessionsOn
			? observed
			: null;
	const session =
		data?.active.find((row) => row.sync_status !== 'failed') ??
		// Recover only a close this till made and never got acknowledged whose closure write
		// was interrupted (closure_id stamped, no local closure row); imported closed history
		// is synced and is never current, and a written closure needs no current session.
		data?.closed.find(
			(row) =>
				row.closure_id === row.id &&
				row.sync_status !== 'synced' &&
				!data.closureRows.some((closure) => closure.id === row.id)
		) ??
		null;
	const entries = data?.entries.filter((row) => row.session_id === session?.id) ?? [];
	const orders =
		data?.orders.hits.filter(
			({ record }) =>
				record.payload.meta_data?.some(
					({ key, value }: { key?: string; value?: unknown }) =>
						key === '_wcpos_session' && value === session?.id
				) || readLedger(record.payload.meta_data).some((row) => row.session_id === session?.id)
		) ?? [];
	const localPending =
		session?.sync_status !== 'synced' ||
		entries.some((row) => row.sync_status === 'pending') ||
		orders.some(({ record }) => record.local.dirty);
	const expected = session
		? !localPending && session.server_expected
			? session.server_expected
			: deriveExpected({
					session,
					movements: entries,
					ledgerRowsBySession: orders.flatMap(({ record }) => readLedger(record.payload.meta_data)),
				})
		: {};
	const now = new Date();
	const [hour, minute] = String(closeTime ?? '')
		.split(':')
		.map(Number);
	const overdue =
		!!session &&
		session.status === 'open' &&
		!!closeTime &&
		now.getTime() >
			new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute).getTime();
	return {
		session,
		movements: entries,
		expected,
		varianceThreshold,
		unsyncedCount:
			orders.filter(({ record }) => record.local.dirty).length +
			entries.filter((row) => row.sync_status === 'pending').length +
			(session?.sync_status === 'pending' ? 1 : 0),
		sessionsOn,
		overdue,
		binding,
		blind: !capabilities?.includes('view_woocommerce_pos_reports'),
		salesCount:
			!localPending && session?.server_sales_count != null
				? session.server_sales_count
				: orders.length,
		lastClosure:
			data?.closureRows.sort((a, b) => b.closed_at.localeCompare(a.closed_at))[0] ?? null,
		lastClosed:
			data?.closed.sort((a, b) =>
				(b.closed_at_gmt ?? '').localeCompare(a.closed_at_gmt ?? '')
			)[0] ?? null,
		actions: {
			openSession: (input: { expectedFloat: string | null; countedFloat: string }) =>
				actions.openSession(sessions!, {
					...input,
					registerId: binding.registerId!,
					openedBy: wpCredentials.id ?? 0,
					storeId: store.id,
				}),
			startCounting: () => actions.startCounting(sessions!, session!.id),
			backToSelling: () => actions.backToSelling(sessions!, session!.id),
			closeSession: async (input: { counted: Record<string, string> }) => {
				const closed =
					session!.status === 'closed'
						? session!
						: await actions.closeSession(sessions!, session!.id, input);
				return actions.writeClosure({
					closures: closures!,
					tillExpected: expected,
					userDB,
					siteUuid: site.uuid!,
					session: closed,
					counted: input.counted.cash,
					otherTenders: Object.fromEntries(
						Object.entries(input.counted).filter(([method]) => method !== 'cash')
					),
					movements: entries,
					orders: orders.map(({ record }) => record),
				});
			},
			recordMovement: async (input: {
				type: 'paid_in' | 'paid_out' | 'no_sale';
				amount: string;
				reason: string;
			}) => {
				const id = await actions.requireOpenSession(sessions, binding.registerId, true);
				return actions.recordMovement(movements!, {
					...input,
					sessionId: id!,
					actor: wpCredentials.id ?? 0,
				});
			},
			voidMovement: async (id: string) => {
				await actions.requireOpenSession(sessions, binding.registerId, true);
				return actions.voidMovement(movements!, id, wpCredentials.id ?? 0);
			},
		},
	};
}
