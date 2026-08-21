import { describe, it } from "node:test";

import parser from "@typescript-eslint/parser";
import { RuleTester } from "eslint";

import { wcposRules } from "../index.js";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: "latest",
    parser,
    sourceType: "module",
  },
});

// Hook identity comes from the observable-hooks IMPORT binding, so every case that
// expects the guard to fire imports the hook (aliased and namespace forms included).
const importHooks =
  "import { useObservable, useObservableState, useObservableEagerState, useObservableSuspense, useObservablePickState, useSubscription } from 'observable-hooks';\n";

ruleTester.run(
  "wcpos/no-dollar-getter-into-observable-hooks",
  wcposRules["no-dollar-getter-into-observable-hooks"],
  {
    valid: [
      `${importHooks}useObservableState(stockRejection$);`,
      `${importHooks}useObservable((inputs$) => inputs$.pipe(switchMap(() => store.currency$)), []);`,
      {
        code: `${importHooks}useObservableEagerState(record.total$);`,
        filename: "packages/query/src/records/use-record-field.ts",
      },
      // An unrelated local function that merely shares a hook's name is NOT the guarded hook.
      "function useObservableEagerState(x) { return x; }\nuseObservableEagerState(store.currency$);",
      // Importing something else from observable-hooks does not arm unrelated names.
      "import { useLayoutObservable } from 'observable-hooks';\nsomethingElse(store.currency$);",
    ],
    invalid: [
      {
        code: `${importHooks}useObservable(store.currency$);`,
        errors: [{ messageId: "useFieldHook" }],
      },
      {
        code: `${importHooks}useObservableState(store['currency$']);`,
        errors: [{ messageId: "useFieldHook" }],
      },
      {
        code: `${importHooks}useObservableEagerState(store?.currency$);`,
        errors: [{ messageId: "useFieldHook" }],
      },
      {
        code: `${importHooks}useObservableSuspense(store.currency$!);`,
        errors: [{ messageId: "useFieldHook" }],
      },
      {
        code: `${importHooks}useObservablePickState(store.$, () => store.currency, 'currency');`,
        errors: [{ messageId: "useFieldHook" }],
      },
      {
        code: `${importHooks}useSubscription(store.currency$ as Observable<string>);`,
        errors: [{ messageId: "useFieldHook" }],
      },
      // Aliased import stays guarded.
      {
        code: "import { useObservableEagerState as useEager } from 'observable-hooks';\nuseEager(store.currency$);",
        errors: [{ messageId: "useFieldHook" }],
      },
      // Namespace import stays guarded.
      {
        code: "import * as hooks from 'observable-hooks';\nhooks.useObservableEagerState(store.currency$);",
        errors: [{ messageId: "useFieldHook" }],
      },
    ],
  },
);
