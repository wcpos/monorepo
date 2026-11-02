import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Every screen that replaces the whole app is a gate (CODING_STANDARDS.md § Design, "Gate
 * screens"). A new one is registered here, on the member of the family it uses: GateScreen
 * inside the providers, FallbackScreen for a route's boundary, PreThemeGate above the providers.
 */
const ROOT = join(__dirname, '../../..');
const GATES = [
	'apps/main/app/+not-found.tsx',
	'packages/core/src/screens/main/update-required.tsx',
	'packages/core/src/screens/main/upgrade-required.tsx',
	'apps/main/components/parked-tab.tsx',
	'packages/core/src/screens/main/pos/cart/clear-local-data.tsx',
	'packages/components/src/error-boundary/fallback-screen.tsx',
	'apps/main/components/root-error.tsx',
	'apps/main/components/clear-local-data-on-startup.tsx',
];
const FAMILY = /import\s*\{[^}]*\b(GateScreen|FallbackScreen|PreThemeGate)\b[^}]*\}\s*from/;

it.each(GATES)('%s is built on the gate family', (file) => {
	expect(readFileSync(join(ROOT, file), 'utf8')).toMatch(FAMILY);
});

/**
 * The shape the parked tab had before it was a gate: an EmptyState and a Button hand-centred
 * in a View. Anything that matches is a whole-app screen laid out by hand.
 */
const HAND_BUILT_GATE =
	/<View\b[^<]*?className="(?=[^"]*\bitems-center\b)(?=[^"]*\bjustify-center\b)[^"]*"[^<]*?>\s*<EmptyState\b[\s\S]*?\/>\s*<Button\b/;
const PARKED_TAB_BEFORE = `
		<View
			testID="parked-tab"
			{...{ dataSet: { state: \`parked:\${state.reason}\` } }}
			className="bg-background flex-1 items-center justify-center p-6"
		>
			<EmptyState testID="parked-tab-content" kind="empty" title={title} description={description} />
			<Button testID="parked-tab-take-over" onPress={takeOver}>`;

it('recognises the hand-built shape it guards against', () => {
	expect(PARKED_TAB_BEFORE).toMatch(HAND_BUILT_GATE);
});

function sources(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sources(path);
		return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
	});
}

it('finds no hand-built gate under the app, its components or the core screens', () => {
	const offenders = ['apps/main/components', 'apps/main/app', 'packages/core/src/screens']
		.flatMap((dir) => sources(join(ROOT, dir)))
		.filter((path) => HAND_BUILT_GATE.test(readFileSync(path, 'utf8')))
		.map((path) => relative(ROOT, path));
	expect(offenders).toEqual([]);
});
