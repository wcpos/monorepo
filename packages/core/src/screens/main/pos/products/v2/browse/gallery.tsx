import * as React from 'react';
import { View } from 'react-native';

import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';

import en from '../../../../../../contexts/translations/locales/en/core.json';
import { TermRow } from './term-row';
import { ParentTermTile, TermTile } from './term-tile';

// The tiles and rows say "All products" and "12 products" through `useT`, and the gallery
// route mounts no store, so no TranslationProvider. One English instance, initialised in
// place (`initAsync: false`, bundled resources, no backend), so the cells show the words
// the cashier sees and never a raw key. Scoped by the provider: nothing global is set.
const i18n = createInstance({
	lng: 'en',
	fallbackLng: 'en',
	ns: ['core'],
	defaultNS: 'core',
	resources: { en: { core: en } },
	keySeparator: false,
	nsSeparator: false,
	interpolation: { escapeValue: false, prefix: '{', suffix: '}' },
	initAsync: false,
});
void i18n.init();

// A bundled, deterministic image: the gallery baseline must not depend on a network fetch.
const SWATCH =
	'data:image/svg+xml;utf8,' +
	encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#c7d2fe"/><circle cx="200" cy="200" r="110" fill="#6366f1"/></svg>'
	);
const drinks = { kind: 'term' as const, id: 1, name: 'Drinks', count: 12, imageSrc: SWATCH };
const snacks = { kind: 'term' as const, id: 2, name: 'Snacks', count: 4 };
const longName = {
	kind: 'term' as const,
	id: 3,
	name: 'Kaffeespezialitäten und Heißgetränke',
	count: 7,
};
const shortcut = {
	kind: 'shortcut' as const,
	id: 'qf',
	name: 'Breakfast',
	description: 'Hot Food + Bakery · in stock',
};
const noop = () => {};

// A tile at a grid cell's width, in a row as the grid lays it (`flex-1` is its share of the row).
function Cell({ children }: React.PropsWithChildren) {
	return (
		<I18nextProvider i18n={i18n}>
			<View className="w-48 flex-row">{children}</View>
		</I18nextProvider>
	);
}

export const stories = [
	{
		id: 'tile-image',
		render: () => (
			<Cell>
				<TermTile term={drinks} onPress={noop} />
			</Cell>
		),
	},
	{
		id: 'tile-plain',
		render: () => (
			<Cell>
				<TermTile term={snacks} onPress={noop} />
			</Cell>
		),
	},
	{
		// Three lines at most on a plain tile (ledger: the name is the picture).
		id: 'tile-long',
		render: () => (
			<Cell>
				<TermTile term={longName} onPress={noop} />
			</Cell>
		),
	},
	{
		id: 'tile-all',
		render: () => (
			<Cell>
				<TermTile term={{ kind: 'all' }} onPress={noop} />
			</Cell>
		),
	},
	{
		// `describeQuickFilter`'s sentence under the name, trimmed to two lines.
		id: 'tile-shortcut',
		render: () => (
			<Cell>
				<TermTile term={shortcut} onPress={noop} />
			</Cell>
		),
	},
	{
		// Slot 0 of a dealt level: the opened term's own tile, with the way back on it.
		id: 'tile-parent',
		render: () => (
			<Cell>
				<ParentTermTile term={drinks} onPress={noop} />
			</Cell>
		),
	},
	{
		// The same four terms as rows of the table card.
		id: 'row',
		render: () => (
			<I18nextProvider i18n={i18n}>
				<View className="w-96">
					<TermRow term={{ kind: 'all' }} onPress={noop} />
					<TermRow term={drinks} onPress={noop} />
					<TermRow term={snacks} onPress={noop} />
					<TermRow term={shortcut} onPress={noop} />
				</View>
			</I18nextProvider>
		),
	},
];
