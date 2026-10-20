import type { CommandProvenance, EngineRecord } from '@wcpos/query';
import type { MetaDataEntry } from '@wcpos/order-math';

import { completionMeta } from './stamp-completion';

import type { SaleContext } from '../sale-completion';

const COMPLETIONS_META_KEY = '_wcpos_completions';
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
 * The provenance a completion-capable money command carries (ADR 0040 §1.3 step 2). The first
 * completion is described by the till tuple `persistProvenance` stamped (the server keeps its own
 * counter for it); a re-completion mints a fresh tuple with its own sale counter, once, when the
 * command is frozen.
 */
export async function commandProvenance(
	ctx: Pick<SaleContext, 'userDB' | 'siteUuid' | 'storeId'>,
	order: EngineRecord<'orders'>,
	sessionId: string | null
): Promise<CommandProvenance | null> {
	const meta = order.getLatest().payload.meta_data ?? [];
	const history = meta.find(({ key }) => key === COMPLETIONS_META_KEY)?.value;
	const recompletion = Array.isArray(history)
		? history.length > 0
		: typeof history === 'string' && history !== '' && history !== '[]';
	if (!recompletion) return fromMeta(meta, false);
	return fromMeta(await completionMeta({ meta_data: [] }, { ...ctx, sessionId }), true);
}
