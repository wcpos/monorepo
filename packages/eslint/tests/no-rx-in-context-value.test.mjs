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
  "wcpos/no-rx-in-context-value",
  wcposRules["no-rx-in-context-value"],
  {
    valid: [
      "interface Value { count: number } const Context = React.createContext<Value | null>(null);",
      "const Context = createContext<ImportedContextValue | null>(null);",
      "interface Value { resource: ObservableResource<string> } const Context = createContext<Value | null>(null);",
      "interface HydrationContext { database: any } const Context = React.createContext<HydrationContext>();",
    ],
    invalid: [
      ...[
        "RxDocument",
        "RxCollection",
        "RxDatabase",
        "RxState",
        "Observable",
        "BehaviorSubject",
        "Subject",
      ].map((name) => ({
        code: `const Context = React.createContext<${name}<unknown> | null>(null);`,
        errors: [{ messageId: "plainContextValue" }],
      })),
      {
        code: "const Context = createContext<StoreObservableValue | null>(null);",
        errors: [{ messageId: "plainContextValue" }],
      },
      {
        code: "interface Value { state: RxState<Record<string, unknown>> } const Context = React.createContext<Value | null>(null);",
        errors: [{ messageId: "plainContextValue" }],
      },
      {
        code: "type State = { updates: Subject<string> }; type Value = State | null; const Context = createContext<Value>(null);",
        errors: [{ messageId: "plainContextValue" }],
      },
      {
        code: "type CurrentRxDocument = RxDocument<unknown>; export interface Value { current: CurrentRxDocument } const Context = React.createContext<Value>(null);",
        errors: [{ messageId: "plainContextValue" }],
      },
    ],
  },
);
