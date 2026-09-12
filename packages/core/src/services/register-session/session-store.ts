import type {
	CashMovementCollection,
	RegisterSessionCollection,
	RegisterSessionRow,
} from '@wcpos/database';
import { fromMinor, toMinor } from '@wcpos/order-math';

import { mintUuid as uuid } from '../register/register-document';

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
	});
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
	const existing = row.voided_by ? await movements.findOne(row.voided_by).exec() : null;
	const id = existing?.id ?? uuid();
	const reversal =
		existing ??
		(await movements.incrementalUpsert({
			id,
			session_id: row.session_id,
			type: 'void',
			amount: row.amount,
			reason: row.reason,
			created_by: actor,
			created_at_gmt: new Date().toISOString(),
			voids: row.id,
			...pending,
		}));
	await row.incrementalPatch({ voided_by: id });
	return reversal;
}
