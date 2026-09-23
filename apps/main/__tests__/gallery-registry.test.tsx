import { readFileSync } from 'node:fs';

// Match the source-only app tests: clear Expo's lazy native runtime after setup.
jest.resetModules();

// A folder with a `gallery.tsx` that is not registered has no cells, and the
// definition of done (landing order, DoD C) fails it silently at the shoot.
// Reading the source keeps this test free of the gallery's native imports.
const registered = [
	'tabs',
	'panels',
	'table',
	"'list-item': listItem",
	'badge',
	'avatar',
	'loader',
	'progress',
	"'sort-icon': sortIcon",
	"'docs-link': docsLink",
	'card',
	'label',
	'form',
	'calendar',
	'numpad',
	"'tree-combobox': treeCombobox",
	'slider',
	'switch: switchStories',
	"'radio-group': radioGroup",
	'checkbox',
	'textarea',
	"'icon-button': iconButton",
	'skeleton',
	"'empty-state': emptyState",
	'notice',
	'breadcrumb',
	"'page-bar': pageBar",
	"'v2-dialog': dialogV2",
	'chip',
	'keypad',
	"'segmented-control': segmentedControl",
];

it('registers every new primitive before the gallery shoot', () => {
	const source = readFileSync(`${__dirname}/../components/gallery/registry.tsx`, 'utf8');
	const entries = source.match(/const registry[^=]*=\s*\{([^}]+)\}/)?.[1];
	expect(entries).toBeDefined();
	const names = entries!.split(',').map((entry) => entry.trim());
	for (const name of registered) expect(names).toContain(name);
});
