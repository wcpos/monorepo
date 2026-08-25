import { describe, it } from 'node:test';

import parser from '@typescript-eslint/parser';
import { RuleTester } from 'eslint';

import { wcposRules } from '../index.js';

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
	languageOptions: {
		ecmaVersion: 'latest',
		parser,
		sourceType: 'module',
	},
});

// Hook identity comes from the observable-hooks IMPORT binding, so every case that
// expects the guard to fire imports the hook (aliased and namespace forms included).
const importHooks =
	"import { useObservable, useObservableState, useLayoutObservableState, useObservablePickState, useObservableGetState, useObservableEagerState } from 'observable-hooks';\n";

ruleTester.run(
	'wcpos/no-live-seed-in-observable-state',
	wcposRules['no-live-seed-in-observable-state'],
	{
		valid: [
			// No seed at all.
			`${importHooks}useObservableState(stores$);`,

			// Literal constants — always the same value, nothing to go stale.
			`${importHooks}useObservableState(stores$, []);`,
			`${importHooks}useObservableState(total$, null);`,
			`${importHooks}useObservableState(total$, 0);`,
			`${importHooks}useObservableState(record$, undefined);`,
			`${importHooks}useObservableState(total$, false);`,
			`${importHooks}useObservableState(allTemplates$, [] as TemplateDocument[]);`,

			// A module-scope constant, referenced bare or through a namespace object.
			`${importHooks}const EMPTY_STATS = { total: 0 };\nuseObservableState(stats$, EMPTY_STATS);`,
			`${importHooks}const DEFAULTS = { stats: { total: 0 } };\nuseObservableState(stats$, DEFAULTS.stats);`,
			`${importHooks}import { EMPTY_NOTIFICATIONS } from './constants';\nuseObservableState(notifications$, EMPTY_NOTIFICATIONS.list);`,

			// `new X()` is always the same empty value — printing overrides, resolved printer.
			`${importHooks}useObservableState(overrides$, new Map<string, string>());`,

			// The dominant correct idiom: a memoised source paired with a constant seed.
			`${importHooks}useObservableState(React.useMemo(() => collection.find().$, [collection]), NO_PROFILES);`,

			// A lazy initialiser is the sanctioned way to defer an allocation.
			`${importHooks}useObservableState(stats$, () => EMPTY_STATS);`,

			// `useObservable`'s second argument is a DEPENDENCY ARRAY, not a seed.
			`${importHooks}useObservable((inputs$) => inputs$.pipe(switchMap(([frequency]) => interval(frequency))), [emitFrequency]);`,

			// The seedless hooks never take an initial state.
			`${importHooks}useObservableEagerState(manualSyncInFlight$);`,

			// `useObservablePickState`'s selector-style second argument.
			`${importHooks}useObservablePickState(store.$, () => store.currency, 'currency');`,

			// An unrelated local function that merely shares a hook's name is not the guarded hook.
			'function useObservableState(a, b) { return b; }\nuseObservableState(x$, getDisplayDate());',

			// Importing something else from observable-hooks does not arm unrelated names.
			"import { useObservableRef } from 'observable-hooks';\nuseObservableState(x$, getDisplayDate());",

			// SHADOWING: identity is the binding in scope at the CALL SITE, so a parameter or
			// local that merely spells the hook's name is not the hook — even in a file that
			// imports the real one.
			`${importHooks}function helper(useObservableState) {
	return useObservableState(source$, getValue());
}`,
			`${importHooks}function Comp() {
	const useObservableState = (source$, seed) => seed;
	return useObservableState(x$, getDisplayDate());
}`,
			`${importHooks}function Comp() {
	{
		let useObservableState = (source$, seed) => seed;
		useObservableState(x$, getDisplayDate());
	}
}`,
			"import * as hooks from 'observable-hooks';\nfunction helper(hooks) {\n\thooks.useObservableState(x$, getDisplayDate());\n}",
		],
		invalid: [
			// A call returns CURRENT state; freezing it at mount is the bug (#-adjacent to
			// use-date-format and the novu bootstrap status).
			{
				code: `${importHooks}useObservableState(displayDate$, getDisplayDate());`,
				errors: [{ messageId: 'liveSeed' }],
			},
			{
				code: `${importHooks}useObservableState(novuBootstrapStatus$, getNovuBootstrapStatus());`,
				errors: [{ messageId: 'liveSeed' }],
			},
			// The BehaviorSubject form gets its own message pointing at useObservableEagerState.
			{
				code: `${importHooks}useObservableState(manualSyncInFlight$, manualSyncInFlight$.getValue());`,
				errors: [{ messageId: 'behaviorSubjectSeed' }],
			},
			{
				code: `${importHooks}useObservableState(manualSyncInFlight$, manualSyncInFlight$.value);`,
				errors: [{ messageId: 'behaviorSubjectSeed' }],
			},
			{
				code: `${importHooks}useObservableState(status$, service.status$.getValue());`,
				errors: [{ messageId: 'behaviorSubjectSeed' }],
			},

			// MUTATION CHECK: the #1551 source verbatim, before the fix (the pre-fix
			// `use-collection.ts` body, `as` cast and all). This is the proof that the guard
			// would have caught the bug that motivated it — `storeDB` is bound inside the hook
			// from a `useStoreSession()` return, so `storeDB.collections[key]` is a read off a
			// value a store switch swaps.
			{
				code: `${importHooks}export const useCollection = (key) => {
	const { storeDB } = useStoreSession();
	const reset$ = React.useMemo(
		() => storeDB.reset$.pipe(filter((collection) => collection.name === key)),
		[storeDB.reset$, key]
	);
	const collection = useObservableState(reset$, storeDB.collections[key]) as StoreCollections[K];
	return collection;
};`,
				errors: [{ messageId: 'swappableSeed' }],
			},
			// Same shape with a static key, and reading straight off a hook return.
			{
				code: `${importHooks}function Comp() {
	const { storeDB } = useStoreSession();
	return useObservableState(reset$, storeDB.collections.logs);
}`,
				errors: [{ messageId: 'swappableSeed' }],
			},
			{
				code: `${importHooks}function Comp({ initialTotal }) {
	return useObservableState(total$, initialTotal.value);
}`,
				errors: [{ messageId: 'swappableSeed' }],
			},

			// Every seed-bearing hook is guarded, not just useObservableState.
			{
				code: `${importHooks}useLayoutObservableState(displayDate$, getDisplayDate());`,
				errors: [{ messageId: 'liveSeed' }],
			},
			{
				code: `${importHooks}useObservablePickState(status$, getNovuBootstrapStatus(), 'isConnected');`,
				errors: [{ messageId: 'liveSeed' }],
			},
			{
				code: `${importHooks}useObservableGetState(status$, getNovuBootstrapStatus());`,
				errors: [{ messageId: 'liveSeed' }],
			},

			// TypeScript wrappers do not hide the seed.
			{
				code: `${importHooks}useObservableState(status$, getNovuBootstrapStatus() as Status);`,
				errors: [{ messageId: 'liveSeed' }],
			},
			{
				code: `${importHooks}useObservableState(inFlight$, inFlight$.getValue()!);`,
				errors: [{ messageId: 'behaviorSubjectSeed' }],
			},

			// Aliased import stays guarded.
			{
				code: "import { useObservableState as useOState } from 'observable-hooks';\nuseOState(displayDate$, getDisplayDate());",
				errors: [{ messageId: 'liveSeed' }],
			},
			// Namespace import stays guarded.
			{
				code: "import * as hooks from 'observable-hooks';\nhooks.useObservableState(displayDate$, getDisplayDate());",
				errors: [{ messageId: 'liveSeed' }],
			},

			// A shadow in one scope does not disarm the genuine import in another: exactly one
			// report here, on the second call.
			{
				code: `${importHooks}function helper(useObservableState) {
	return useObservableState(inner$, getValue());
}
function Comp() {
	return useObservableState(displayDate$, getDisplayDate());
}`,
				errors: [{ messageId: 'liveSeed' }],
			},
			{
				code: "import * as hooks from 'observable-hooks';\nfunction helper(hooks) {\n\thooks.useObservableState(inner$, getValue());\n}\nfunction Comp() {\n\treturn hooks.useObservableState(displayDate$, getDisplayDate());\n}",
				errors: [{ messageId: 'liveSeed' }],
			},
		],
	}
);
