import { readFileSync } from 'node:fs';

jest.resetModules();

it('registers breadcrumb and page-bar stories in the gallery map', () => {
	const source = readFileSync(`${__dirname}/../components/gallery/registry.tsx`, 'utf8');
	expect(source).toMatch(
		/import \{ stories as breadcrumb \} from '@wcpos\/components\/breadcrumb\/gallery'/
	);
	expect(source).toMatch(
		/import \{ stories as pageBar \} from '@wcpos\/components\/page-bar\/gallery'/
	);
	const registry = source.match(/const registry[^=]*=\s*\{([^}]+)\}/)?.[1];
	expect(registry).toMatch(/\bbreadcrumb\b/);
	expect(registry).toMatch(/'page-bar': pageBar/);
});
