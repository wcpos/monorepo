import type {
	CashMovementCollection,
	CashMovementRow,
	ClosureCollection,
	ClosureDocument,
	ClosureRow,
	RegisterSessionCollection,
	RegisterSessionRow,
	UserDatabase,
} from '@wcpos/database';
import { fromMinor, readLedger, toMinor } from '@wcpos/order-math';
import { AppInfo } from '@wcpos/utils/app-info';

import {
	advancePerpetual,
	mintClosureNumber,
	readRegister,
	mintUuid as uuid,
} from '../register/register-document';
import { deriveExpected } from './expected';

export const pending = {
	sync_status: 'pending',
	sync_attempts: 0,
	sync_next_at: null,
	sync_error: null,
} as const;
export class RegisterSessionRequiredError extends Error {
	constructor() {
		super('register_session_not_open');
		this.name = 'RegisterSessionRequiredError';
	}
}
export async function requireOpenSession(
	sessions: RegisterSessionCollection | undefined,
	registerId: string | null,
	enabled: boolean
) {
	if (!enabled) return null;
	const session = await sessions
		?.findOne({
			selector: { register_id: registerId ?? '', status: 'open', sync_status: { $ne: 'failed' } },
		})
		.exec();
	if (!session) throw new RegisterSessionRequiredError();
	// This gate precedes money actions: a pre-action snapshot must not return after sync.
	await session.incrementalPatch({ server_expected: null, server_sales_count: null });
	return session.id;
}
export function openSession(
	sessions: RegisterSessionCollection,
	input: {
		registerId: string;
		expectedFloat: string | null;
		countedFloat: string;
		openedBy: number;
		storeId?: number | null;
	}
) {
	return sessions.insert({
		id: uuid(),
		register_id: input.registerId,
		store_id: input.storeId ?? null,
		status: 'open',
		opened_at_gmt: new Date().toISOString(),
		opened_by: input.openedBy,
		expected_float: input.expectedFloat,
		counted_float: input.countedFloat,
		opening_variance:
			input.expectedFloat === null
				? null
				: fromMinor(toMinor(input.countedFloat, 4) - toMinor(input.expectedFloat, 4), 4),
		...pending,
	});
}
async function transition(
	sessions: RegisterSessionCollection,
	id: string,
	status: RegisterSessionRow['status'],
	extra: Partial<RegisterSessionRow> = {}
) {
	const row = await sessions.findOne(id).exec();
	if (!row) throw new RegisterSessionRequiredError();
	const at = new Date().toISOString();
	return row.incrementalPatch({
		...pending,
		...extra,
		status,
		pending_status: status,
		status_at: at,
		...(status === 'counting' ? { counting_started_at_gmt: at } : {}),
		...(status === 'closed' ? { closed_at_gmt: at } : {}),
	});
}
export const startCounting = (sessions: RegisterSessionCollection, id: string) =>
	transition(sessions, id, 'counting');
export const backToSelling = (sessions: RegisterSessionCollection, id: string) =>
	transition(sessions, id, 'open');
export const closeSession = (
	sessions: RegisterSessionCollection,
	id: string,
	input: { counted: Record<string, string> }
) =>
	transition(sessions, id, 'closed', {
		counted: input.counted,
		closure_id: id,
	});
/**
 * Put a refused movement back in the outbox. The row is the only record of cash that has
 * physically moved, so the cashier needs a way to send it again once whatever the server
 * objected to — a capability, a closed session, a bad field — has been dealt with.
 */
export async function retryMovement(movements: CashMovementCollection, movementId: string) {
	const row = await movements.findOne(movementId).exec();
	if (!row) throw new Error('invalid_retry_target');
	return row.incrementalPatch({ ...pending });
}
export function recordMovement(
	movements: CashMovementCollection,
	input: {
		sessionId: string;
		type: 'paid_in' | 'paid_out' | 'no_sale';
		amount: string;
		reason: string;
		actor: number;
	}
) {
	return movements.insert({
		id: uuid(),
		session_id: input.sessionId,
		type: input.type,
		amount: input.amount,
		reason: input.reason,
		created_by: input.actor,
		created_at_gmt: new Date().toISOString(),
		...pending,
	});
}
export async function voidMovement(
	movements: CashMovementCollection,
	movementId: string,
	actor: number
) {
	const row = await movements.findOne(movementId).exec();
	if (!row || row.type === 'void') throw new Error('invalid_void_target');
	// Repeated Undo taps share one durable reversal: the target's voided_by names it.
	const id = uuid();
	const claimed = await row.incrementalModify((doc) => {
		doc.voided_by ??= id;
		return doc;
	});
	const reversalId = claimed.voided_by!;
	const existing = await movements.findOne(reversalId).exec();
	const reversal =
		existing ??
		(await movements.incrementalUpsert({
			id: reversalId,
			session_id: row.session_id,
			type: 'void',
			amount: row.amount,
			reason: row.reason,
			created_by: actor,
			created_at_gmt: new Date().toISOString(),
			voids: row.id,
			...pending,
		}));
	return reversal;
}

export async function writeClosure({
	closures,
	userDB,
	siteUuid,
	session,
	counted,
	otherTenders,
	movements,
	orders,
	tillExpected,
}: {
	closures: ClosureCollection;
	userDB: UserDatabase;
	siteUuid: string;
	session: RegisterSessionRow;
	counted: string;
	otherTenders: Record<string, string>;
	movements: readonly CashMovementRow[];
	orders: readonly ClosureOrder[];
	tillExpected?: Record<string, string>;
}) {
	const existing = await closures.findOne(session.id).exec();
	if (existing) {
		await advancePerpetual(userDB, siteUuid, session.register_id, {
			sales: existing.period_sales_total,
			refunds: existing.period_refunds_total,
			closureId: existing.id,
		});
		return existing;
	}
	const bound = orders.filter(
		(order) =>
			order.payload.meta_data?.some(
				({ key, value }) => key === '_wcpos_session' && value === session.id
			) || readLedger(order.payload.meta_data).some((row) => row.session_id === session.id)
	);
	const rows = bound
		.flatMap((order) => readLedger(order.payload.meta_data))
		.filter((row) => row.session_id === session.id && row.status === 'captured');
	const entries = movements.filter((row) => row.session_id === session.id);
	const till_expected =
		tillExpected ?? deriveExpected({ session, movements: entries, ledgerRowsBySession: rows });
	const counts = { cash: counted, ...otherTenders };
	const sum = (values: string[]) =>
		fromMinor(
			values.reduce((total, value) => total + toMinor(value, 4), 0),
			4
		);
	const payment_methods: Record<string, { sales: string; refunds: string }> = {};
	for (const row of rows) {
		const method = row.kind === 'cash' ? 'cash' : row.method_id;
		const previous = payment_methods[method];
		payment_methods[method] = {
			sales: sum([previous?.sales ?? '0', row.amount]),
			refunds: sum([previous?.refunds ?? '0', row.refunded_amount]),
		};
	}
	const tax_rates: Record<string, { net: string; tax: string; gross: string }> = {};
	for (const order of bound) {
		for (const tax of order.payload.tax_lines ?? []) {
			const key = String(tax.rate_id);
			const amount = toMinor(tax.tax_total ?? '0', 4) + toMinor(tax.shipping_tax_total ?? '0', 4);
			const net = tax.rate_percent ? Math.round((amount * 100) / tax.rate_percent) : 0;
			const previous = tax_rates[key];
			tax_rates[key] = {
				net: sum([previous?.net ?? '0', fromMinor(net, 4)]),
				tax: sum([previous?.tax ?? '0', fromMinor(amount, 4)]),
				gross: sum([previous?.gross ?? '0', fromMinor(net + amount, 4)]),
			};
		}
	}
	const dirtyOrders = bound.filter((order) => order.local?.dirty);
	const dirtyMovements = entries.filter((row) => row.sync_status === 'pending');

	const counters = bound
		.map((order) =>
			Number(order.payload.meta_data?.find(({ key }) => key === '_wcpos_sale_counter')?.value)
		)
		.filter((value) => value > 0);
	const draft: ClosureRow = {
		id: session.id,
		session_id: session.id,
		register_id: session.register_id,
		store_id: session.store_id ?? null,
		number: 0,
		opened_at: session.opened_at_gmt,
		closed_at: session.closed_at_gmt!,
		till_expected,
		expected: till_expected,
		counted: counts,
		variance: Object.fromEntries(
			Object.entries(counts).map(([method, value]) => [
				method,
				fromMinor(toMinor(value, 4) - toMinor(till_expected[method] ?? '0', 4), 4),
			])
		),
		period_sales_total: sum(rows.map((row) => row.amount)),
		period_refunds_total: sum(rows.map((row) => row.refunded_amount)),
		perpetual_sales_total: '0',
		perpetual_refunds_total: '0',
		unsynced_count:
			dirtyOrders.length + dirtyMovements.length + (session.sync_status === 'pending' ? 1 : 0),
		unsynced_total: sum([
			...dirtyMovements.map((row) => row.amount),
			...dirtyOrders
				.flatMap((order) => readLedger(order.payload.meta_data))
				.filter((row) => row.session_id === session.id && row.status === 'captured')
				.map((row) => fromMinor(toMinor(row.amount, 4) - toMinor(row.refunded_amount, 4), 4)),
		]),
		first_sale_counter: counters.length ? Math.min(...counters) : null,
		last_sale_counter: counters.length ? Math.max(...counters) : null,
		software_version: AppInfo.version,
		printed_at: null,
		print_count: 0,
		breakdowns: {
			payment_methods,
			tax_rates,
			opening_float: {
				expected: session.expected_float ?? null,
				counted: session.counted_float,
				variance: session.opening_variance ?? null,
			},
			movements: entries.map(({ id, type, amount, reason, voids, voided_by }) => ({
				id,
				type,
				amount,
				reason,
				voids: voids ?? null,
				voided_by: voided_by ?? null,
			})),
			transaction_count: bound.filter((order) =>
				readLedger(order.payload.meta_data).some(
					(row) => row.session_id === session.id && row.status === 'captured'
				)
			).length,
			refund_count: rows.filter((row) => toMinor(row.refunded_amount, 4) > 0).length,
			cashiers: [
				...new Set(
					bound
						.map((order) =>
							String(order.payload.meta_data?.find(({ key }) => key === '_pos_user')?.value ?? '')
						)
						.filter(Boolean)
				),
			],
		},
		order_ids: bound.map((order) => order.uuid),
		movement_ids: entries.map((row) => row.id),
		...pending,
	};
	// Reserve the snapshot in the same atomic document write as its number. A failed insert
	// or restarted till reuses this exact snapshot; the existing outbox remains the only sender.
	await mintClosureNumber(userDB, siteUuid, session.register_id, draft);
	const reserved = (await readRegister(userDB))!.sites[siteUuid].registers![session.register_id]
		.closure_reservation!.row;
	let row: ClosureDocument;
	try {
		row = await closures.insert({
			...reserved,
			order_ids: [...reserved.order_ids],
			movement_ids: [...reserved.movement_ids],
		});
	} catch (error) {
		const winner = await closures.findOne(reserved.id).exec();
		if (!winner) throw error;
		row = winner;
	}
	await advancePerpetual(userDB, siteUuid, session.register_id, {
		sales: row.period_sales_total,
		refunds: row.period_refunds_total,
		closureId: row.id,
	});
	return row;
}

type ClosureOrder = {
	uuid: string;
	local?: { dirty: boolean };
	payload: {
		meta_data?: Parameters<typeof readLedger>[0];
		tax_lines?: readonly {
			rate_id?: number;
			rate_percent?: number;
			tax_total?: string;
			shipping_tax_total?: string;
		}[];
	};
};
