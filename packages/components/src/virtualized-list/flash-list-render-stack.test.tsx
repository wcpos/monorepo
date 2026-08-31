/**
 * Regression pin for the second hunk of the patched `@shopify/flash-list@2.0.2`
 * (`patches/@shopify__flash-list@2.0.2.patch`; backport of Shopify/flash-list#2460).
 *
 * `RecyclerViewManager.modifyChildrenLayout()` truncates the layout table when the data
 * shrinks, but only re-syncs the render stack on some of its exit paths, so a
 * `RenderStackManager` key can still point at an index the table no longer has. The
 * unpatched render path read it through the throwing `getLayout(index)` — "index out of
 * bounds, not enough layouts" — and the whole list went down with it: the POS products
 * grid dropped into its error boundary the moment a tablet's products column was dragged
 * narrower (iPad, flow 09, 2026-08-30) and mid-search on Android (run 33280466971).
 *
 * The patch reads through `tryGetLayout` instead (undefined for a dropped index), and
 * `ViewHolderCollection` renders nothing for that key — it is reused on the next render
 * stack sync — rather than a cell with no layout and an undefined item. This drives the
 * patched component itself: a stale key past the table must not throw and must not mount.
 */
import * as React from 'react';
import { Text } from 'react-native';

import { render } from '@testing-library/react';
import { ViewHolderCollection } from '@shopify/flash-list/dist/recyclerview/ViewHolderCollection';

type Layout = { x: number; y: number; width: number; height: number };

// The dist typings want the full RecyclerView plumbing; the test supplies only what the
// render path reads, so the component is typed loosely here.
const Collection = ViewHolderCollection as unknown as React.ComponentType<Record<string, unknown>>;

const ROW: Omit<Layout, 'y'> = { x: 0, width: 400, height: 50 };

function renderCollection({
	data,
	renderStack,
	layoutCount,
}: {
	data: number[];
	renderStack: Map<string, { index: number }>;
	layoutCount: number;
}) {
	const layouts: Layout[] = Array.from({ length: layoutCount }, (_, index) => ({
		...ROW,
		y: index * ROW.height,
	}));
	const props = {
		data,
		renderStack,
		// The patched RecyclerView passes `tryGetLayout`: undefined past the table.
		getLayout: (index: number) => layouts[index],
		refHolder: new Map(),
		onSizeChanged: () => undefined,
		renderItem: ({ item }: { item: number }) => <Text>{`row-${item}`}</Text>,
		extraData: undefined,
		getChildContainerLayout: () => ({ x: 0, y: 0, width: 400, height: 800 }),
		horizontal: false,
		getAdjustmentMargin: () => 0,
		viewHolderCollectionRef: React.createRef(),
		onCommitLayoutEffect: () => undefined,
		onCommitEffect: () => undefined,
	};
	return render(<Collection {...props} />);
}

describe('flash-list ViewHolderCollection with a render stack that outlived the layout table', () => {
	it('renders the keys that still have a layout and skips the ones past the table', () => {
		// Ten rows were mounted; the data (and the layout table) shrank to three, but the
		// render stack still holds keys for indices 0..9.
		const renderStack = new Map(
			Array.from({ length: 10 }, (_, index) => [`key-${index}`, { index }] as const)
		);

		let screen: ReturnType<typeof render> | undefined;
		expect(() => {
			screen = renderCollection({ data: [0, 1, 2], renderStack, layoutCount: 3 });
		}).not.toThrow();

		expect(screen!.getByText('row-0')).toBeTruthy();
		expect(screen!.getByText('row-2')).toBeTruthy();
		// Nothing is mounted for a key whose index the table no longer has — not a cell
		// with an undefined item, and not a throw.
		expect(screen!.queryByText('row-3')).toBeNull();
		expect(screen!.queryByText('row-undefined')).toBeNull();
	});

	it('still renders every key when the table covers the whole render stack', () => {
		const renderStack = new Map(
			Array.from({ length: 3 }, (_, index) => [`key-${index}`, { index }] as const)
		);
		const screen = renderCollection({ data: [0, 1, 2], renderStack, layoutCount: 3 });
		expect(screen.getAllByText(/^row-/)).toHaveLength(3);
	});
});
