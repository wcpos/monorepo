import { derive, readCompletions, readLedger, toMinor } from '@wcpos/order-math';
import type { CommandProvenance, EngineRecord, ProvenanceCommand } from '@wcpos/query';
import type { MetaDataEntry } from '@wcpos/order-math';

import { completionMeta } from './stamp-completion';

import type { SaleContext } from '../sale-completion';

const FIELDS: Record<string, keyof CommandProvenance> = {
	_wcpos_register: 'register_id',
	_wcpos_session: 'session_id',
	_wcpos_sale_time: 'sale_time',
	_wcpos_sale_tz: 'sale_tz',
	_wcpos_sale_counter: 'sale_counter',
};

function fromMeta(meta: readonly MetaDataEntry[], withCounter: boolean): CommandProvenance | null {
	const provenance: CommandProvenance = {};
	for (const { key, value } of meta) {
		const field = key ? FIELDS[key] : undefined;
		if (field && (withCounter || field !== 'sale_counter') && value != null && value !== '')
			provenance[field] = String(value);
	}
	return Object.keys(provenance).length ? provenance : null;
}

/**
 * Whether the command, if the store runs it, completes the sale: a close or a gateway submit
 * always does; a record or a capture when its amount covers the balance. An intent never does
 * (an authorization does not count, ADR 0040 D6): its capture is the completing command.
 */
function completesSale(
	command: ProvenanceCommand,
	payload: EngineRecord<'orders'>['payload'],
	dp: number
): boolean {
	if (command.kind === 'close' || command.kind === 'submit') return true;
	if (command.kind !== 'record' && command.kind !== 'capture') return false;
	const rows = readLedger(payload.meta_data ?? []);
	const amount =
		command.kind === 'record'
			? (command.body.payment as { amount?: unknown } | undefined)?.amount
			: ((command.body.context as { amount?: unknown } | undefined)?.amount ??
				rows.find(({ id }) => id === command.target)?.amount);
	if (amount === undefined || amount === null) return false;
	const { balance } = derive(payload.total, rows, [], { dp });
	return toMinor(amount as string, dp) >= toMinor(balance, dp);
}

/**
 * The provenance a completion-capable money command carries (ADR 0040 §1.3 step 2). The first
 * completion is described by the till tuple `persistProvenance` stamped (the server keeps its own
 * counter for it); a re-completion mints a fresh tuple with its own sale counter, once, when the
 * command is frozen, and only for the command that completes the sale: a partial leg of a
 * reopened sale carries none and allocates no counter. `sessionId` is the session the leg's gates
 * approved (a resumed leg: the session its row was minted under).
 */
export async function commandProvenance(
	ctx: Pick<SaleContext, 'userDB' | 'siteUuid' | 'storeId'> & { dp?: number },
	order: EngineRecord<'orders'>,
	sessionId: string | null,
	command: ProvenanceCommand
): Promise<CommandProvenance | null> {
	const payload = order.getLatest().payload;
	const meta = payload.meta_data ?? [];
	if (readCompletions(meta).length === 0) return fromMeta(meta, false);
	if (!completesSale(command, payload, ctx.dp ?? 2)) return null;
	const { userDB, siteUuid, storeId } = ctx;
	return fromMeta(
		await completionMeta({ meta_data: [] }, { userDB, siteUuid, storeId, sessionId }),
		true
	);
}
