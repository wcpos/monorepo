import { rowsSince, type SplitView } from './split-view';
import { type TenderFacts, tenderFigures } from './tender-figures';

import type { TenderFlow } from './use-tender-flow';

/** A hand-made split: the parts a test names, the rest empty, unpaid units derived as `splitView` does. */
export function splitWith(over: Partial<SplitView> = {}): SplitView {
	const lines = over.lines ?? [];
	const paidUnits = over.paidUnits ?? {};
	return {
		lines,
		allocations: {},
		paidUnits,
		unpaidUnits: Object.fromEntries(
			lines.map(({ id, quantity }) => [
				String(id),
				Math.max(0, quantity - (paidUnits[id]?.units ?? 0)),
			])
		),
		picked: {},
		splitOn: false,
		legUnits: null,
		rowsSinceFrom: [],
		...over,
	};
}

/**
 * A hand-made flow with the figures the hook would compute from its own facts, so a view test
 * never pairs numbers the hook could not produce together. The legs taken follow the flow's
 * rows and plan, as `splitView` derives them.
 */
export function withFigures(
	flow: Omit<TenderFlow, 'figures' | 'split'> & { split?: SplitView },
	{
		titleOf = (id) => flow.tiles?.find(({ method }) => method.id === id)?.method.title ?? id,
		...over
	}: Partial<TenderFacts> & { titleOf?: (methodId: string) => string } = {}
): TenderFlow {
	const split = splitWith({
		...flow.split,
		rowsSinceFrom: rowsSince(flow.state.plan, flow.rows ?? [], flow.dp, titleOf),
	});
	return {
		...flow,
		split,
		figures: tenderFigures({
			dp: flow.dp,
			balanceMinor: flow.balanceMinor,
			rows: flow.rows ?? [],
			method: flow.method ?? null,
			state: flow.state,
			split,
			...over,
		}),
	};
}
