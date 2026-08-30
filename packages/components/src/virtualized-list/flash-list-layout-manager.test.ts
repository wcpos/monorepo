/**
 * Regression pin for the patched `@shopify/flash-list@2.0.2`
 * (`patches/@shopify__flash-list@2.0.2.patch`).
 *
 * FlashList's `RecyclerView` layout effect measures every mounted `ViewHolder` and hands
 * the resulting `layoutInfo` to `RVLayoutManager.modifyLayout(layoutInfo, data.length)`.
 * When `data` shrinks — every keystroke in the POS product search rechunks the hit list
 * into fewer grid rows — `modifyLayout` truncates `this.layouts` to the new length while
 * `layoutInfo` still carries the indices of the ViewHolders that were mounted before the
 * shrink. Unpatched, `processLayoutInfo` then does `this.layouts[index].width = ...` on an
 * index that no longer exists and throws
 * `TypeError: Cannot set property 'width' of undefined`, which took the whole product grid
 * into the error boundary mid-sale (#1671).
 *
 * The patch backports the guard flash-list shipped in 2.2.2: out-of-bounds entries are
 * filtered out of `layoutInfo` at the point of truncation. This test drives the installed
 * layout manager directly, so it fails if the patch is dropped or stops applying.
 */
import { RVLinearLayoutManagerImpl } from '@shopify/flash-list/dist/recyclerview/layout-managers/LinearLayoutManager';

import type { LayoutParams } from '@shopify/flash-list/dist/recyclerview/layout-managers/LayoutManager';

const ROW_HEIGHT = 200;

const layoutParams: LayoutParams = {
	windowSize: { width: 400, height: 800 },
	maxColumns: 1,
	horizontal: false,
	optimizeItemArrangement: true,
	overrideItemLayout: () => undefined,
	getItemType: () => 'row',
};

/** What the RecyclerView layout effect reports for `count` mounted ViewHolders. */
const measurementsFor = (count: number) =>
	Array.from({ length: count }, (_, index) => ({
		index,
		dimensions: { width: layoutParams.windowSize.width, height: ROW_HEIGHT },
	}));

describe('flash-list layout manager with a shrinking data set', () => {
	it('drops stale ViewHolder measurements instead of throwing', () => {
		const layoutManager = new RVLinearLayoutManagerImpl(layoutParams);

		// A full search result: ten rows, all mounted and measured.
		layoutManager.modifyLayout([], 10);
		layoutManager.modifyLayout(measurementsFor(10), 10);
		expect(layoutManager.getLayoutCount()).toBe(10);

		// The next keystroke narrows the result to three rows, but the layout effect still
		// reports the ten ViewHolders that were mounted for the previous result.
		expect(() => layoutManager.modifyLayout(measurementsFor(10), 3)).not.toThrow();
		expect(layoutManager.getLayoutCount()).toBe(3);
	});

	it('still applies the measurements that are in bounds', () => {
		const layoutManager = new RVLinearLayoutManagerImpl(layoutParams);

		layoutManager.modifyLayout([], 10);
		layoutManager.modifyLayout(measurementsFor(10), 10);
		layoutManager.modifyLayout(measurementsFor(10), 3);

		// The surviving rows keep their measured height and stay stacked from the top,
		// i.e. the guard filters the stale entries rather than skipping the whole batch.
		expect(layoutManager.getLayout(0).height).toBe(ROW_HEIGHT);
		expect(layoutManager.getLayout(2).y).toBe(ROW_HEIGHT * 2);
		expect(layoutManager.getLayoutSize().height).toBe(ROW_HEIGHT * 3);
	});
});
