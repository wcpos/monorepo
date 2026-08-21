import expoConfig from 'eslint-config-expo/flat.js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import reactCompiler from 'eslint-plugin-react-compiler';

const observableHookNames = new Set([
	'useObservable',
	'useObservableState',
	'useObservableEagerState',
	'useObservableSuspense',
	'useObservablePickState',
	'useSubscription',
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

export const wcposRules = {
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
			// Resolve hook identity from the observable-hooks IMPORT bindings, not the
			// call-site spelling: aliased/namespace imports stay guarded, and unrelated
			// local functions that merely share a hook's name are not flagged.
			const localHookNames = new Set();
			const namespaceNames = new Set();
			const checkArguments = (node) => {
				for (const argument of node.arguments) {
					const expression = unwrapTypeScriptExpression(argument);
					if (
						expression?.type === 'MemberExpression' &&
						String(memberPropertyName(expression)).endsWith('$')
					) {
						context.report({ node: argument, messageId: 'useFieldHook' });
					}
				}
			};
			return {
				ImportDeclaration(node) {
					if (node.source.value !== 'observable-hooks') return;
					for (const specifier of node.specifiers) {
						if (
							specifier.type === 'ImportSpecifier' &&
							specifier.imported.type === 'Identifier' &&
							observableHookNames.has(specifier.imported.name)
						) {
							localHookNames.add(specifier.local.name);
						} else if (specifier.type === 'ImportNamespaceSpecifier') {
							namespaceNames.add(specifier.local.name);
						}
					}
				},
				CallExpression(node) {
					const callee = node.callee;
					if (callee.type === 'Identifier' && localHookNames.has(callee.name)) {
						checkArguments(node);
						return;
					}
					if (
						callee.type === 'MemberExpression' &&
						callee.object.type === 'Identifier' &&
						namespaceNames.has(callee.object.name) &&
						observableHookNames.has(memberPropertyName(callee))
					) {
						checkArguments(node);
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

const cwd = process.cwd().replaceAll('\\', '/');
const appCodeFiles = cwd.endsWith('/packages/core')
	? ['src/**/*.{ts,tsx}']
	: cwd.endsWith('/apps/main')
		? ['**/*.{js,jsx,ts,tsx}']
		: ['**/packages/core/src/**/*.{ts,tsx}', '**/apps/main/**/*.{js,jsx,ts,tsx}'];

export const config = [
	// Global ignores - git submodules manage their own linting
	{ ignores: ['apps/electron/**', 'apps/web/**'] },
	eslintPluginPrettierRecommended,
	...expoConfig,
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
		files: ['**/*.{js,jsx,ts,tsx}'],
		settings: {
			'import/resolver': {
				typescript: {
					project: ['../../tsconfig.json', './packages/*/tsconfig.json'],
				},
			},
		},
		rules: {
			'prettier/prettier': [
				'error',
				{
					useTabs: true,
					singleQuote: true,
					trailingComma: 'es5',
					printWidth: 100,
					endOfLine: 'lf',
					plugins: ['prettier-plugin-tailwindcss'],
					tailwindFunctions: ['cn', 'cva'],
				},
			],

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
	reactCompiler.configs.recommended,
	// Files that legitimately need default exports
	{
		files: [
			'app/**/*.{ts,tsx}', // Expo Router requires default exports
			'**/app/**/*.{ts,tsx}', // Same Expo Router convention when linting from repo root
			'app.config.ts', // Expo config
			'**/*.config.{ts,js}', // Config files (playwright, etc.)
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
