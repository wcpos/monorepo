import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const appRoot = join(__dirname, '..');
const routeRoot = 'app/(app)/(drawer)';

const settingsRoutes = [
	'index.tsx',
	'general.tsx',
	'tax.tsx',
	'printing.tsx',
	'barcode-scanning.tsx',
	'shortcuts.tsx',
	'theme.tsx',
];
const healthRoutes = ['index.tsx', 'database.tsx', 'performance.tsx', 'logs.tsx'];

function source(path: string): string {
	return readFileSync(join(appRoot, path), 'utf8');
}

describe('settings and Store health route structure', () => {
	it('defines every deep-linkable settings and health page', () => {
		for (const route of settingsRoutes) {
			expect(existsSync(join(appRoot, routeRoot, 'settings', route))).toBe(true);
		}
		for (const route of healthRoutes) {
			expect(existsSync(join(appRoot, routeRoot, 'health', route))).toBe(true);
		}
	});

	it('registers Store health then Settings in the bottom-pinned drawer group', () => {
		const drawer = source(`${routeRoot}/_layout.tsx`);
		const healthPosition = drawer.indexOf('name="health"');
		const settingsPosition = drawer.indexOf('name="settings"');
		const supportPosition = drawer.indexOf('name="support"');

		expect(healthPosition).toBeGreaterThan(-1);
		expect(settingsPosition).toBeGreaterThan(healthPosition);
		expect(supportPosition).toBeGreaterThan(settingsPosition);
		expect(drawer).not.toContain('name="logs"');
	});

	it('retires the settings modal and old top-level logs routes', () => {
		expect(existsSync(join(appRoot, 'app/(app)/(modals)/settings.tsx'))).toBe(false);
		expect(existsSync(join(appRoot, routeRoot, 'logs/index.tsx'))).toBe(false);
		expect(source('app/(app)/_layout.tsx')).not.toContain('(modals)/settings');
	});

	it('routes settings entry points to the new area', () => {
		expect(
			source('../../packages/core/src/screens/main/components/header/user-menu.tsx')
		).toContain("router.push('/settings')");
		expect(
			source('../../packages/core/src/screens/main/hooks/use-keyboard-shortcuts.ts')
		).toContain("router.push('/settings')");
	});

	it('renders the existing logs screen at the nested health route', () => {
		expect(source(`${routeRoot}/health/logs.tsx`)).toContain('@wcpos/core/screens/main/logs');
	});

	it('gives every drawer route a stable navigation selector', () => {
		expect(
			source('../../packages/core/src/screens/main/components/drawer-content/drawer-item-list.tsx')
		).toContain('testID={`drawer-item-${route.name.replace');
	});
});
