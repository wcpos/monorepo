import { useDocField } from './use-record-field';

import type { RxState } from 'rxdb';

type Settings = { theme: string };
type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

/** Compile-time contract: production RxState instances are accepted by useDocField. */
function useRxStateContract(state: RxState<Settings>): string {
	return useDocField(state, (settings) => {
		type SelectorReceivesState = Expect<Equal<typeof settings, Settings>>;
		const selectorReceivesState: SelectorReceivesState = true;
		void selectorReceivesState;
		return settings.theme;
	});
}

void useRxStateContract;
