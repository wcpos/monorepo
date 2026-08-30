/**
 * Regression pin for the patched `@shopify/flash-list@2.0.2`
 * (`patches/@shopify__flash-list@2.0.2.patch`).
 *
 * FlashList's `RecyclerView` layout effect measures every mounted `ViewHolder` and hands
 * the resulting `layoutInfo` to `RVLayoutManager.modifyLayout(layoutInfo, data.length)`.
 * When `data` shrinks — every keystroke in the POS product search rechunks the hit list
 * into fewer grid rows — `layoutInfo` still carries the indices of the ViewHolders that
 * were mounted before the shrink. Unpatched, `processLayoutInfo` does
 * `this.layouts[index].width = ...` on an index that no longer exists and throws
 * `TypeError: Cannot set property 'width' of undefined`, which took the whole product
 * grid into the error boundary mid-sale (#1671).
 *
 * Two orderings reach that write, and the second is the one the app actually takes:
 *
 *   A. the shrink and the stale measurements arrive in the same `modifyLayout` call —
 *      the case flash-list guarded in 2.2.2, inside its `layouts.length > totalItemCount`
 *      truncation branch;
 *   B. `RecyclerViewManager.processDataUpdate()` runs first, during render, as
 *      `modifyLayout([], newLength)`. That trims `layouts` with an *empty* `layoutInfo`,
 *      so when the layout effect follows with the stale measurements the truncation
 *      branch no longer fires and upstream's guard never runs. Upstream still throws here
 *      as of 2.3.2; the patch filters unconditionally, which covers both.
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

/** A full search result: ten rows, all mounted and measured. */
function tenMeasuredRows() {
	const layoutManager = new RVLinearLayoutManagerImpl(layoutParams);
	layoutManager.modifyLayout([], 10);
	layoutManager.modifyLayout(measurementsFor(10), 10);
	expect(layoutManager.getLayoutCount()).toBe(10);
	return layoutManager;
}

describe('flash-list layout manager with a shrinking data set', () => {
	it('drops stale ViewHolder measurements reported with the shrink', () => {
		const layoutManager = tenMeasuredRows();

		// The next keystroke narrows the result to three rows, and the layout effect still
		// reports the ten ViewHolders that were mounted for the previous result.
		expect(() => layoutManager.modifyLayout(measurementsFor(10), 3)).not.toThrow();
		expect(layoutManager.getLayoutCount()).toBe(3);
	});

	it('drops stale ViewHolder measurements reported after the shrink', () => {
		const layoutManager = tenMeasuredRows();

		// `processDataUpdate()` trims during render, with no measurements of its own...
		layoutManager.modifyLayout([], 3);
		expect(layoutManager.getLayoutCount()).toBe(3);

		// ...and only then does the layout effect report the still-mounted ViewHolders.
		// This is the ordering the app takes, and the one upstream's 2.2.2 guard misses.
		expect(() => layoutManager.modifyLayout(measurementsFor(10), 3)).not.toThrow();
		expect(layoutManager.getLayoutCount()).toBe(3);
	});

	it('still applies the measurements that are in bounds', () => {
		const layoutManager = tenMeasuredRows();

		layoutManager.modifyLayout([], 3);
		layoutManager.modifyLayout(measurementsFor(10), 3);

		// The surviving rows keep their measured height and stay stacked from the top,
		// i.e. the guard filters the stale entries rather than skipping the whole batch.
		expect(layoutManager.getLayout(0).height).toBe(ROW_HEIGHT);
		expect(layoutManager.getLayout(2).y).toBe(ROW_HEIGHT * 2);
		expect(layoutManager.getLayoutSize().height).toBe(ROW_HEIGHT * 3);
	});

	it('keeps measurements for rows the data grew into', () => {
		const layoutManager = new RVLinearLayoutManagerImpl(layoutParams);

		// Growth must not be caught by the filter: indices below the new count are
		// materialized before `processLayoutInfo` runs.
		layoutManager.modifyLayout([], 3);
		layoutManager.modifyLayout(measurementsFor(3), 3);
		layoutManager.modifyLayout(measurementsFor(3), 10);

		expect(layoutManager.getLayoutCount()).toBe(10);
		expect(layoutManager.getLayout(2).height).toBe(ROW_HEIGHT);
	});
});
