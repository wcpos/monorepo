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

ruleTester.run(
  "wcpos/no-dollar-getter-into-observable-hooks",
  wcposRules["no-dollar-getter-into-observable-hooks"],
  {
    valid: [
      "useObservableState(stockRejection$);",
      "useObservable((inputs$) => inputs$.pipe(switchMap(() => store.currency$)), []);",
      {
        code: "useObservableEagerState(record.total$);",
        filename: "packages/query/src/records/use-record-field.ts",
      },
    ],
    invalid: [
      {
        code: "useObservable(store.currency$);",
        errors: [{ messageId: "useFieldHook" }],
      },
      {
        code: "useObservableState(store['currency$']);",
        errors: [{ messageId: "useFieldHook" }],
      },
      {
        code: "useObservableEagerState(store?.currency$);",
        errors: [{ messageId: "useFieldHook" }],
      },
      {
        code: "useObservableSuspense(store.currency$!);",
        errors: [{ messageId: "useFieldHook" }],
      },
      {
        code: "useObservablePickState(store.$, () => store.currency, 'currency');",
        errors: [{ messageId: "useFieldHook" }],
      },
      {
        code: "useSubscription(store.currency$ as Observable<string>);",
        errors: [{ messageId: "useFieldHook" }],
      },
    ],
  },
);
