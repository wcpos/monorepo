import { type TenderFacts, tenderFigures } from './tender-figures';

import type { TenderFlow } from './use-tender-flow';

/**
 * A hand-made flow with the figures the hook would compute from its own facts, so a view test
 * never pairs numbers the hook could not produce together.
 */
export function withFigures(
	flow: Omit<TenderFlow, 'figures'>,
	over: Partial<TenderFacts> = {}
): TenderFlow {
	return {
		...flow,
		figures: tenderFigures({
			dp: flow.dp,
			balanceMinor: flow.balanceMinor,
			rows: flow.rows ?? [],
			titleOf: (id) => flow.tiles?.find(({ method }) => method.id === id)?.method.title ?? id,
			method: flow.method ?? null,
			state: flow.state,
			lines: flow.lines ?? [],
			picked: flow.picked ?? {},
			paidUnits: flow.paidUnits ?? {},
			...over,
		}),
	};
}
