import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { ESLint } from "eslint";

import componentsConfig from "../../components/eslint.config.mjs";
import { config } from "../index.js";

// Type-aware linting is on for **/*.{ts,tsx}, so a synthetic path would be
// rejected by the TS project service ("not found by the project service").
// Lint the sample text AT a real file's path instead — the same trick an editor
// uses for unsaved buffers — so the parser has a project to resolve against.
const REPO_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const IN_APP = join(
  REPO_ROOT,
  "packages/core/src/screens/main/health/database.tsx",
);
const IN_DESIGN_SYSTEM = join(
  REPO_ROOT,
  "packages/components/src/button/index.tsx",
);
const COMPONENTS_ROOT = join(REPO_ROOT, "packages/components");

async function lint(
  code,
  filePath,
  ruleId,
  baseConfig = config,
  cwd = REPO_ROOT,
) {
  // cwd must be the repo root: ESLint silently skips any file outside its base
  // path, which would make every assertion below pass vacuously.
  const eslint = new ESLint({ baseConfig, overrideConfigFile: true, cwd });
  const [result] = await eslint.lintText(code, { filePath });
  assert(
    !result.messages.some((m) => m.fatal),
    `fixture failed to parse: ${result.messages.find((m) => m.fatal)?.message}`,
  );
  return result.messages.filter((m) => m.ruleId === ruleId);
}

const variantOwnership = (code) => lint(code, IN_APP, "no-restricted-syntax");

test("rejects colour utilities on components that own colour as a variant", async () => {
  // The Store Health regression this rule exists to prevent: a destructive label
  // painted onto a `default` (blue) confirm button.
  const messages = await variantOwnership(`
		export function Bad() {
			return (
				<>
					<AlertDialogAction>
						<Text className="text-destructive">Clear</Text>
					</AlertDialogAction>
					<ModalAction><Text className="text-destructive">Remove</Text></ModalAction>
					<Button className="bg-transparent rounded-none">Menu</Button>
					<Badge className="border-destructive">3</Badge>
				</>
			);
		}
	`);

  assert.equal(messages.length, 4);
});

test("rejects font-size utilities that duplicate or fight the size prop", async () => {
  const messages = await variantOwnership(`
		export function Bad() {
			return <Button size="sm"><ButtonText className="text-sm">Retry</ButtonText></Button>;
		}
	`);

  assert.equal(messages.length, 1);
});

test("allows layout utilities - no component models its own margin", async () => {
  const messages = await variantOwnership(`
		export function Fine() {
			return (
				<>
					<Button variant="destructive" className="self-start px-0">
						<ButtonText className="font-semibold">Delete</ButtonText>
					</Button>
					<Button className="flex-1 mt-2 gap-2" />
				</>
			);
		}
	`);

  assert.deepEqual(messages, []);
});

test("allows text alignment, which is layout rather than colour or size", async () => {
  const messages = await variantOwnership(`
		export function Fine() {
			return <ButtonText className="text-center">Save</ButtonText>;
		}
	`);

  assert.deepEqual(messages, []);
});

test("allows conditional state styling, which no variant models yet", async () => {
  // Deliberate gap, not an oversight: a selected/active nav item has no variant
  // to reach for, so flagging cn(..., selected && '...') would only buy
  // eslint-disable comments. Widen the selector if Button grows a state axis.
  const messages = await variantOwnership(`
		export function Fine({ selected }) {
			return (
				<ButtonText className={cn('flex-1', selected && 'text-primary font-semibold')}>
					Products
				</ButtonText>
			);
		}
	`);

  assert.deepEqual(messages, []);
});

test("allows colour on primitives that expose no variant for it", async () => {
  // <Text> has no semantic variant for "this is an error", so the token IS the API.
  const messages = await variantOwnership(`
		export function Fine({ error }) {
			return <Text className="text-destructive text-sm">{error}</Text>;
		}
	`);

  assert.deepEqual(messages, []);
});

test("rejects defining a variant vocabulary outside the design system", async () => {
  const messages = await lint(
    `import { cva } from 'class-variance-authority';`,
    IN_APP,
    "no-restricted-imports",
  );

  assert.equal(messages.length, 1);
});

test("allows cva inside packages/components, where variants are defined", async () => {
  const messages = await lint(
    `import { cva } from 'class-variance-authority';`,
    IN_DESIGN_SYSTEM,
    "no-restricted-imports",
  );

  assert.deepEqual(messages, []);
});

test("allows cva when lint runs from the packages/components workspace", async () => {
  const messages = await lint(
    `import { cva } from 'class-variance-authority';`,
    join(COMPONENTS_ROOT, "src/button/index.tsx"),
    "no-restricted-imports",
    componentsConfig,
    COMPONENTS_ROOT,
  );

  assert.deepEqual(messages, []);
});

test("packages/components still enforces the reanimated v4 import restriction", async () => {
  // Regression guard: flat-config rules override rather than merge, so the
  // packages/components block must restate every path it still wants enforced.
  const messages = await lint(
    `import { runOnJS } from 'react-native-reanimated';`,
    IN_DESIGN_SYSTEM,
    "no-restricted-imports",
  );

  assert.equal(messages.length, 1);
});
