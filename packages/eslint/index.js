import path from 'node:path';
import { fileURLToPath } from 'node:url';

import expoConfig from 'eslint-config-expo/flat.js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import youMightNotNeedAnEffect from 'eslint-plugin-react-you-might-not-need-an-effect';
import reactCompiler from 'eslint-plugin-react-compiler';

import prettierConfig from './prettier.js';

const observableHookNames = new Set([
	'useObservable',
	'useObservableState',
	'useObservableEagerState',
	'useObservableSuspense',
	'useObservablePickState',
	'useSubscription',
]);

/**
 * observable-hooks entry points whose SECOND argument is the initial state.
 *
 * Deliberately excludes `useObservable(init, inputs)`, whose second argument is a
 * dependency array, and the seedless hooks (`useObservableEagerState`,
 * `useSubscription`, `useObservableSuspense`).
 */
const seedBearingObservableHookNames = new Set([
	'useObservableState',
	'useLayoutObservableState',
	'useObservablePickState',
	'useObservableGetState',
]);

const rxContextTypeNames = [
	'RxDocument',
	'RxCollection',
	'RxDatabase',
	'RxState',
	'Observable',
	'BehaviorSubject',
	'Subject',
];

function unwrapTypeScriptExpression(node) {
	let current = node;
	while (
		current?.type === 'ChainExpression' ||
		current?.type === 'TSAsExpression' ||
		current?.type === 'TSNonNullExpression' ||
		current?.type === 'TSTypeAssertion'
	) {
		current = current.expression;
	}
	return current;
}

function memberPropertyName(node) {
	if (node.computed) {
		return node.property.type === 'Literal' ? node.property.value : undefined;
	}
	return node.property.type === 'Identifier' ? node.property.name : undefined;
}

function typeReferenceName(node) {
	if (node?.type === 'Identifier') return node.name;
	if (node?.type === 'TSQualifiedName') {
		return `${typeReferenceName(node.left)}.${typeReferenceName(node.right)}`;
	}
	return undefined;
}

function isRxContextTypeName(name) {
	// ObservableResource is the sanctioned Suspense carrier, not a raw observable in context.
	if (!name || name.includes('ObservableResource')) return false;
	return rxContextTypeNames.some((rxName) => name.includes(rxName));
}

function containsRxContextType(node, declarations, seen = new Set()) {
	if (!node || typeof node !== 'object') return false;

	if (node.type === 'TSTypeReference') {
		const name = typeReferenceName(node.typeName);
		if (isRxContextTypeName(name)) return true;
		const declaration = name && declarations.get(name);
		if (declaration && !seen.has(name)) {
			const nextSeen = new Set(seen).add(name);
			const declaredType =
				declaration.type === 'TSInterfaceDeclaration'
					? declaration.body
					: declaration.typeAnnotation;
			if (containsRxContextType(declaredType, declarations, nextSeen)) return true;
		}
	}

	if (node.type === 'TSImportType' && isRxContextTypeName(typeReferenceName(node.qualifier))) {
		return true;
	}

	for (const [key, value] of Object.entries(node)) {
		if (['loc', 'range', 'parent', 'tokens', 'comments', 'typeName', 'qualifier'].includes(key)) {
			continue;
		}
		if (Array.isArray(value)) {
			if (value.some((child) => containsRxContextType(child, declarations, seen))) return true;
		} else if (containsRxContextType(value, declarations, seen)) {
			return true;
		}
	}
	return false;
}

function isCreateContextCall(node) {
	if (node.callee.type === 'Identifier') return node.callee.name === 'createContext';
	if (node.callee.type !== 'MemberExpression') return false;
	return (
		node.callee.object.type === 'Identifier' &&
		node.callee.object.name === 'React' &&
		memberPropertyName(node.callee) === 'createContext'
	);
}

/**
 * Innermost binding for an identifier, or `null` when it resolves to a global.
 *
 * Real scope resolution, not name matching: the binding that wins is the one an inner
 * scope introduces, so a parameter or local that merely spells an import's name resolves
 * to itself.
 */
function resolveBinding(context, identifier) {
	for (let scope = context.sourceCode.getScope(identifier); scope; scope = scope.upper) {
		const variable = scope.set.get(identifier.name);
		if (variable) return variable;
	}
	return null;
}

/**
 * The `observable-hooks` import specifier an identifier resolves to at THIS call site, or
 * `null`. `def.type === 'ImportBinding'` is the check that separates the real import from
 * anything that shadows it.
 */
function observableHooksImportSpecifier(context, identifier) {
	const definition = resolveBinding(context, identifier)?.defs?.[0];
	if (definition?.type !== 'ImportBinding') return null;
	if (definition.parent?.type !== 'ImportDeclaration') return null;
	if (definition.parent.source.value !== 'observable-hooks') return null;
	return definition.node;
}

/**
 * Resolve observable-hook identity from the binding in scope AT THE CALL SITE rather than
 * the call-site spelling: aliased (`useObservableState as useOState`) and namespace
 * (`import * as hooks`) imports stay guarded, while an unrelated local function — or a
 * parameter shadowing the import inside a helper, in a file that also imports the real
 * hook — is never flagged.
 *
 * Shared by `no-live-seed-in-observable-state` and
 * `no-dollar-getter-into-observable-hooks`, so both rules resolve identity the same way.
 */
function createObservableHookTracker(context, hookNames) {
	return {
		isHookCall(node) {
			const callee = unwrapTypeScriptExpression(node.callee);
			if (callee?.type === 'Identifier') {
				const specifier = observableHooksImportSpecifier(context, callee);
				return (
					specifier?.type === 'ImportSpecifier' &&
					specifier.imported.type === 'Identifier' &&
					hookNames.has(specifier.imported.name)
				);
			}
			if (callee?.type !== 'MemberExpression') return false;
			const namespace = unwrapTypeScriptExpression(callee.object);
			if (namespace?.type !== 'Identifier') return false;
			return (
				observableHooksImportSpecifier(context, namespace)?.type === 'ImportNamespaceSpecifier' &&
				hookNames.has(memberPropertyName(callee))
			);
		},
	};
}

/** Root object of a member chain: `a.b[c].d` -> the `a` Identifier. */
function memberChainRoot(node) {
	let current = unwrapTypeScriptExpression(node);
	while (current?.type === 'MemberExpression') {
		current = unwrapTypeScriptExpression(current.object);
	}
	return current;
}

/**
 * Whether an identifier is bound once for the module (a top-level const/import/function)
 * rather than recomputed per render.
 *
 * This is the whole precision story for the member-expression half of
 * `no-live-seed-in-observable-state`: a module-scope binding is one value for the life of
 * the process, so reading a property off it at mount cannot go stale. A binding introduced
 * inside a component — props, a hook return like `const { storeDB } = useStoreSession()`,
 * a local — is recomputed on every render and CAN be swapped underneath a seed that is
 * only ever read once. Unresolved names (globals) are treated as stable.
 */
function isModuleScopeBinding(context, identifier) {
	const variable = resolveBinding(context, identifier);
	if (!variable) return true;
	const scopeType = variable.scope.type;
	return scopeType === 'module' || scopeType === 'global';
}

export const wcposRules = {
	/**
	 * `useObservableState(source$, seed)` reads `seed` ONCE, in a `useState` initializer on
	 * the first render (observable-hooks `useObservableStateInternal`), and subscribes in a
	 * plain `useEffect`. A seed that evaluates *current* state is therefore frozen at mount.
	 *
	 * Two live occurrences in three days motivated this rule — #1542 (reads bound after a
	 * store switch followed the boot scope) and #1551 (`useCollection` seeded with
	 * `storeDB.collections[key]`, so a store switch whose `reset$` never emitted kept the
	 * logger writing into the store the cashier had just left).
	 */
	'no-live-seed-in-observable-state': {
		meta: {
			type: 'problem',
			docs: {
				description:
					'Disallow live (call-expression or swappable member) seeds in observable-hook initial state.',
			},
			schema: [],
			messages: {
				liveSeed:
					"An observable hook's second argument is the INITIAL state, read once on the first render. A call here freezes current state at mount and never re-reads it. Seed with a constant and let the observable carry the value, or recompute on render and use the observable only to trigger the refresh.",
				behaviorSubjectSeed:
					"Seeding from a BehaviorSubject's current value freezes it at mount. Use useObservableEagerState(source$) instead — it reads the synchronous value rather than latching a seed.",
				swappableSeed:
					"An observable hook's second argument is the INITIAL state, read once on the first render. Reading it off a value that can be swapped (a store database, a collections map) serves the pre-swap value forever whenever the new observable does not emit — that is #1551. Follow the value with an observable that emits on the swap, and seed with a constant.",
			},
		},
		create(context) {
			const tracker = createObservableHookTracker(context, seedBearingObservableHookNames);
			return {
				CallExpression(node) {
					if (!tracker.isHookCall(node)) return;
					const seed = unwrapTypeScriptExpression(node.arguments[1]);
					if (!seed) return;

					if (seed.type === 'CallExpression') {
						const callee = unwrapTypeScriptExpression(seed.callee);
						const messageId =
							callee?.type === 'MemberExpression' && memberPropertyName(callee) === 'getValue'
								? 'behaviorSubjectSeed'
								: 'liveSeed';
						context.report({ node: seed, messageId });
						return;
					}

					if (seed.type !== 'MemberExpression') return;

					// `subject$.value` is the property spelling of `.getValue()`.
					const object = unwrapTypeScriptExpression(seed.object);
					if (
						memberPropertyName(seed) === 'value' &&
						((object?.type === 'Identifier' && object.name.endsWith('$')) ||
							(object?.type === 'MemberExpression' &&
								String(memberPropertyName(object)).endsWith('$')))
					) {
						context.report({ node: seed, messageId: 'behaviorSubjectSeed' });
						return;
					}

					const root = memberChainRoot(seed);
					if (root?.type !== 'Identifier') return;
					if (isModuleScopeBinding(context, root)) return;
					context.report({ node: seed, messageId: 'swappableSeed' });
				},
			};
		},
	},
	'no-dollar-getter-into-observable-hooks': {
		meta: {
			type: 'problem',
			docs: {
				description: 'Disallow fresh $-getter observables as observable-hook arguments.',
			},
			schema: [],
			messages: {
				useFieldHook:
					'Do not pass a $-getter into an observable hook. Use useDocField(source, selector) or useRecordField(record, selector).',
			},
		},
		create(context) {
			if (/(^|\/)packages\/query\/src\/records\//.test(context.filename.replaceAll('\\', '/'))) {
				return {};
			}
			// Hook identity comes from the binding in scope at the call site, not the
			// call-site spelling — see createObservableHookTracker.
			const tracker = createObservableHookTracker(context, observableHookNames);
			return {
				CallExpression(node) {
					if (!tracker.isHookCall(node)) return;
					for (const argument of node.arguments) {
						const expression = unwrapTypeScriptExpression(argument);
						if (
							expression?.type === 'MemberExpression' &&
							String(memberPropertyName(expression)).endsWith('$')
						) {
							context.report({ node: argument, messageId: 'useFieldHook' });
						}
					}
				},
			};
		},
	},
	'no-rx-in-context-value': {
		meta: {
			type: 'problem',
			docs: {
				description:
					'Disallow Rx documents, state, collections, databases, and observables in React context values. ObservableResource is excluded because it is the sanctioned Suspense carrier. Exception criteria (owner ruling 2026-08-21): an Observable may live in a context value ONLY as a stable-for-the-provider-lifetime event channel (never a data source), consumed exclusively in effects/pipelines — dated inline disables state the reason.',
			},
			schema: [],
			messages: {
				plainContextValue:
					'React context values must contain plain data, not Rx documents, state, collections, databases, or observables.',
			},
		},
		create(context) {
			const declarations = new Map();
			return {
				Program(node) {
					for (const statement of node.body) {
						const declaration =
							statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
						if (
							(declaration?.type === 'TSInterfaceDeclaration' ||
								declaration?.type === 'TSTypeAliasDeclaration') &&
							declaration.id.type === 'Identifier'
						) {
							declarations.set(declaration.id.name, declaration);
						}
					}
				},
				CallExpression(node) {
					if (!isCreateContextCall(node)) return;
					const typeArguments = node.typeArguments ?? node.typeParameters;
					const contextType = typeArguments?.params?.[0];
					if (containsRxContextType(contextType, declarations)) {
						context.report({
							node: contextType,
							messageId: 'plainContextValue',
						});
					}
				},
			};
		},
	},
};

const wcposPlugin = { rules: wcposRules };

/**
 * tsconfig list for eslint-import-resolver-typescript, anchored to THIS file
 * rather than to process.cwd().
 *
 * The resolver globs `project` from the CWD, so CWD-relative entries resolve to
 * a different set of tsconfigs per invocation. `../../tsconfig.json` lands on
 * the repo root when eslint runs from `packages/<pkg>` (turbo lint) but escapes
 * the repo when it runs from the repo root (lint-staged). From a git worktree
 * under `.claude/worktrees/<name>/` it escaped into the *main* checkout, whose
 * tsconfig extends `expo/tsconfig.base` and is unresolvable without an
 * installed node_modules — which broke the pre-commit hook in every worktree.
 */
const repoRoot = path
	.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
	.replaceAll('\\', '/');
const resolverProjects = [`${repoRoot}/tsconfig.json`, `${repoRoot}/packages/*/tsconfig.json`];

const cwd = process.cwd().replaceAll('\\', '/');
const appCodeFiles = cwd.endsWith('/packages/core')
	? ['src/**/*.{ts,tsx}']
	: cwd.endsWith('/apps/main')
		? ['**/*.{js,jsx,ts,tsx}']
		: ['**/packages/core/src/**/*.{ts,tsx}', '**/apps/main/**/*.{js,jsx,ts,tsx}'];

export const config = [
	{
		ignores: [
			// Git submodules manage their own linting.
			'apps/electron/**',
			'apps/web/**',
			// Targeted recovery is vendored three ways, and the electron copy lives in
			// another repository. Never let eslint --fix break their byte identity.
			// Matched by filename, not path: packages lint with `eslint src` from
			// their own directory, so a repo-relative pattern silently misses.
			'**/opfs-targeted-recovery*.mjs',
		],
	},
	eslintPluginPrettierRecommended,
	...expoConfig,
	{
		// Repo tooling is Node, not React Native: `.mjs`/`.cjs` here are build guards,
		// codegen and CI checks that legitimately use Node globals. Without this they
		// report `'Buffer' is not defined` once the prettier glob covers them.
		files: ['**/*.{mjs,cjs}'],
		// These modules form the browser-bundled OPFS worker graph, so Node globals
		// must remain unavailable even though they use the `.mjs` extension.
		ignores: ['**/opfs-worker-entry.mjs', '**/opfs-targeted-recovery*.mjs'],
		languageOptions: {
			globals: {
				Buffer: 'readonly',
				process: 'readonly',
				console: 'readonly',
				__dirname: 'readonly',
				__filename: 'readonly',
				URL: 'readonly',
				TextEncoder: 'readonly',
				TextDecoder: 'readonly',
			},
		},
	},
	{
		files: ['**/*.{ts,tsx}'],
		ignores: ['**/*.test.{ts,tsx}', '**/e2e/**', '**/*.config.{ts,tsx}'],
		languageOptions: {
			parserOptions: {
				projectService: true,
			},
		},
		rules: {
			'@typescript-eslint/no-floating-promises': 'error',
			// attributes:false — async JSX handlers (onPress etc.) are idiomatic RN;
			// rejections there surface as unhandled-rejection reports, not silent data loss
			'@typescript-eslint/no-misused-promises': [
				'error',
				{ checksVoidReturn: { attributes: false } },
			],
		},
	},
	{
		files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'],
		settings: {
			'import/resolver': {
				typescript: {
					project: resolverProjects,
				},
			},
		},
		rules: {
			'prettier/prettier': ['error', prettierConfig],

			// 1) import/order for grouping/newlines only — no alphabetize
			'import/order': [
				'error',
				{
					pathGroups: [
						{
							pattern: 'react+(-native|)',
							group: 'external',
							position: 'before',
						},
						{
							pattern: '@wcpos/**',
							group: 'external',
							position: 'after',
						},
					],
					pathGroupsExcludedImportTypes: ['react', 'react-native'],
					groups: ['builtin', 'external', ['parent', 'sibling', 'index'], 'type'],
					'newlines-between': 'always',
				},
			],

			// 2) sort-imports for in-brace specifier sorting
			'sort-imports': [
				'error',
				{
					ignoreDeclarationSort: true, // leave statement order to import/order
					ignoreMemberSort: false, // sort the { a, b, c } lists
					ignoreCase: true,
					memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
				},
			],
			'import/no-unresolved': [
				'error',
				{
					ignore: ['^uniwind$', '^uniwind/.+', '^rxdb-premium/.+'],
				},
			],

			// Catch deprecated reanimated imports that moved to react-native-worklets in v4
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: 'react-native-reanimated',
							importNames: [
								'runOnJS',
								'runOnUI',
								'executeOnUIRuntimeSync',
								'runOnRuntime',
								'makeShareableCloneRecursive',
								'createWorkletRuntime',
								'WorkletRuntime',
								'isWorkletFunction',
							],
							message:
								'This export is deprecated in reanimated v4. Import from "react-native-worklets" instead (e.g. runOnJS → scheduleOnRN, runOnUI → scheduleOnUI).',
						},
						// A cva() call outside the design system IS a homegrown component:
						// a second variant vocabulary nobody else can discover, reuse, or
						// keep in step. Re-allowed for packages/components below.
						{
							name: 'class-variance-authority',
							message:
								'Variant systems live in packages/components. Add a variant to the existing component rather than defining a local one.',
						},
					],
				},
			],

			'@typescript-eslint/no-useless-constructor': 'off',

			// prefer function declarations for named components, and arrow functions for unnamed components
			'react/function-component-definition': [
				'error',
				{
					namedComponents: 'function-declaration',
					unnamedComponents: 'arrow-function',
				},
			],

			// prefer named exports over default exports
			'import/no-default-export': 'error',
		},
	},

	// A component that models an axis as a variant OWNS that axis. Setting it from
	// a className gives one pixel two sources of truth, and the winner is decided by
	// class-merge order rather than by design — that is how a `destructive` label
	// ended up painted on a `default` (blue) confirm button in Store Health.
	//
	// Layout is deliberately NOT restricted: no component models its own margin.
	//
	// NOTE: `no-restricted-syntax` blocks OVERRIDE rather than merge in flat config.
	// This block and the e2e block below must never share a `files` glob, or one
	// set of selectors silently disappears.
	{
		files: ['**/packages/core/**/*.tsx', '**/apps/main/**/*.tsx'],
		ignores: ['**/*.test.tsx'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					// `>` (direct child) deliberately limits this to the STATIC form,
					// className="…". A cn(…, selected && 'text-primary') is conditional
					// STATE styling, which no variant currently models — flagging it would
					// only buy eslint-disable comments. Every instance of the bug class this
					// rule was written for (PR: red label on a blue confirm) was a static
					// literal. If Button ever grows a state axis, widen this to a descendant
					// selector and sweep the cn() call sites.
					selector:
						'JSXOpeningElement[name.name=/^(Button|ButtonText|Badge|IconButton|StatusBadge)$/]' +
						' > JSXAttribute[name.name="className"]' +
						' > Literal[value=/(^|\\s)(bg-|border-|text-(?!left|center|right|justify|wrap|nowrap))/]',
					message:
						'Colour and type on this component are owned by its variant/size props. Use the right variant (e.g. variant="destructive", variant="ghost-quiet", size="xs") — or add the missing variant in packages/components — instead of a className.',
				},
				{
					selector:
						'JSXElement:has(> JSXOpeningElement[name.name=/^(AlertDialogAction|ModalAction)$/])' +
						' > JSXElement > JSXOpeningElement[name.name="Text"]' +
						' > JSXAttribute[name.name="className"]' +
						' > Literal[value=/(^|\\s)(bg-|border-|text-(?!left|center|right|justify|wrap|nowrap))/]',
					message:
						'Colour and type on an action label are owned by the action variant/size props. Use the right variant or size instead of a Text className.',
				},
			],
		},
	},

	{
		files: appCodeFiles,
		plugins: { wcpos: wcposPlugin },
		rules: {
			'wcpos/no-dollar-getter-into-observable-hooks': 'error',
			'wcpos/no-live-seed-in-observable-state': 'error',
			'wcpos/no-rx-in-context-value': 'error',
		},
	},

	// The design system is where variants are defined, so cva is allowed here. The
	// reanimated paths are RESTATED rather than inherited: flat-config rules override
	// rather than merge, so anything this block omits stops being enforced here.
	{
		files: ['**/packages/components/**/*.{js,jsx,ts,tsx}'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: 'react-native-reanimated',
							importNames: [
								'runOnJS',
								'runOnUI',
								'executeOnUIRuntimeSync',
								'runOnRuntime',
								'makeShareableCloneRecursive',
								'createWorkletRuntime',
								'WorkletRuntime',
								'isWorkletFunction',
							],
							message:
								'This export is deprecated in reanimated v4. Import from "react-native-worklets" instead (e.g. runOnJS → scheduleOnRN, runOnUI → scheduleOnUI).',
						},
					],
				},
			],
		},
	},

	// E2E tests run against localized stores; selectors must be stable testIDs, not UI copy.
	{
		files: ['**/e2e/**/*.{ts,tsx,js,jsx}'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector: "CallExpression[callee.property.name='getByText']",
					message: 'E2E tests must use getByTestId(), not localized visible text.',
				},
				{
					selector: "CallExpression[callee.property.name='getByPlaceholder']",
					message: 'E2E tests must use getByTestId(), not localized placeholders.',
				},
				{
					selector: "CallExpression[callee.property.name='getByLabel']",
					message: 'E2E tests must use getByTestId(), not localized labels.',
				},
				{
					selector:
						"CallExpression[callee.property.name='getByRole'] ObjectExpression Property[key.name='name']",
					message: 'E2E tests must use getByTestId(), not localized role names.',
				},

				{
					selector: "CallExpression[callee.property.name='locator'] Literal[value=/^text=/]",
					message: 'E2E tests must use getByTestId(), not text locators.',
				},
			],
		},
	},
	// TRIAL (2026-08-29, owner: "try including that for a while"). Catches
	// effects that should not exist at all — derived state, event-handler logic,
	// hand-rolled store subscriptions. Complements react-hooks rather than
	// duplicating it: `react-hooks/set-state-in-effect` covers synchronous
	// setState in an effect, this covers the wider family.
	//
	// WARN, not error, deliberately: it is on trial. If it earns its place,
	// promote to `strict`; if it turns out noisy, drop it — do not leave it
	// warning forever, since a warning nobody acts on is just noise.
	//
	// Note it would NOT have caught monorepo#1666: that effect legitimately
	// synchronised with an external system, and the bug was a DESTRUCTIVE
	// cleanup, which no rule in this plugin models.
	{
		// Its `configs.recommended` also sets `languageOptions.parserOptions`,
		// which clobbers the TypeScript parser configuration the packages set up
		// earlier — @wcpos/printer failed with "Parsing error: Unexpected token
		// interface". Take the plugin and its rules, leave parsing alone.
		plugins: { 'react-you-might-not-need-an-effect': youMightNotNeedAnEffect },
		rules: Object.fromEntries(
			Object.keys(youMightNotNeedAnEffect.configs.recommended.rules).map((rule) => [rule, 'warn'])
		),
	},
	reactCompiler.configs.recommended,
	// Files that legitimately need default exports
	{
		files: [
			'app/**/*.{ts,tsx}', // Expo Router requires default exports
			'**/app/**/*.{ts,tsx}', // Same Expo Router convention when linting from repo root
			'app.config.ts', // Expo config
			'**/*.config.ts', // TypeScript config files (playwright, etc.)
			'**/*.config.{js,mjs,cjs}', // JavaScript config modules require default exports
			'**/eslint.config.mjs', // ESLint flat config uses its conventional default export
			'prettier.js', // Canonical prettier config when linting this package directly
			'**/packages/eslint/prettier.js', // Same config when linting from the repo root
			'**/*.stories.{ts,tsx}', // Storybook
			'**/e2e/global-setup.ts', // Playwright global setup
			'**/tree-dom.tsx', // Expo "use dom" requires default export
			'**/discord.tsx', // Expo "use dom" requires default export
			'**/receipt-rasterizer.dom.tsx', // Expo "use dom" requires default export
			'**/reports/chart/chart.tsx', // Dynamic import via WithSkiaWeb requires default export
		],
		rules: {
			'import/no-default-export': 'off',
		},
	},
];
