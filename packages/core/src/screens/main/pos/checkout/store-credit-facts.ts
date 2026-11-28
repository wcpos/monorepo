import type { EngineRecord } from '@wcpos/query';
import { pushRecord } from '@wcpos/query/mutations';
import { hasPendingLocalWork, residentRevision } from '@wcpos/sync-engine';

import { readCouponContext } from '../hooks/use-coupon-context';
import { getOrderSaveState } from './checkout-mode';

import type { SaleContext } from './sale-completion';

/** Contract T3: a declared line's tender waits this long for a fresh ack, then refuses. */
export const STORE_CREDIT_ACK_BUDGET_MS = 5_000;
export interface StoreCreditFacts {
	needsConnection: boolean;
	emptyCodes: string[];
}

export async function readStoreCreditFacts(
	ctx: { runtime: SaleContext['runtime']; storeCalculatedTypes: ReadonlySet<string> | undefined },
	record: EngineRecord<'orders'>,
	reachable: boolean
): Promise<StoreCreditFacts | null> {
	const { storeCalculatedTypes } = ctx;
	if (!storeCalculatedTypes?.size) return null;
	const couponLines = (record.getLatest().payload.coupon_lines ?? []).filter(
		(line): line is typeof line & { code: string } =>
			typeof line.code === 'string' && line.code !== ''
	);
	if (!couponLines.length) return null;
	const { storeCalculated } = await readCouponContext(ctx.runtime, {
		lineItems: [],
		couponLines,
		storeCalculatedTypes,
	});
	const declared = new Set(
		couponLines.map((line) => line.code.toLowerCase()).filter((code) => storeCalculated.has(code))
	);
	if (!declared.size) return null;
	const save = getOrderSaveState(record.uuid);
	const needsConnection = { needsConnection: true, emptyCodes: [] };
	if (!reachable || save?.kind === 'queued-offline' || save?.kind === 'rejected')
		return needsConnection;
	const fresh = () => {
		const latest = record.getLatest();
		return !hasPendingLocalWork(latest) && residentRevision(latest).holdsDocument();
	};
	if (save?.kind === 'saving' || !fresh()) {
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			const push = pushRecord(ctx.runtime, record);
			void push.catch(() => {});
			await Promise.race([
				push,
				new Promise<never>((_, reject) => {
					timer = setTimeout(reject, STORE_CREDIT_ACK_BUDGET_MS);
				}),
			]);
		} catch {
			return needsConnection;
		} finally {
			clearTimeout(timer);
		}
		if (!fresh()) return needsConnection;
	}
	const emptyCodes = (record.getLatest().payload.coupon_lines ?? []).flatMap((line) =>
		line.code &&
		declared.has(line.code.toLowerCase()) &&
		Number(line.discount) + Number(line.discount_tax) === 0
			? [line.code]
			: []
	);
	return { needsConnection: false, emptyCodes };
}
