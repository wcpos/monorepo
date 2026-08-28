import { createPanelGroupModel } from './PanelGroupModel';

import type { PanelConstraints, PanelData } from '../Panel';

function panel(
	id: string,
	constraints: PanelConstraints = {},
	options: Partial<Pick<PanelData, 'callbacks' | 'order'>> = {}
): PanelData {
	return {
		callbacks: options.callbacks ?? {},
		constraints,
		id,
		idIsFromProps: true,
		order: options.order,
	};
}

function modelWithPanels(...panels: PanelData[]) {
	const model = createPanelGroupModel({ direction: 'horizontal' });
	panels.forEach(model.registerPanel);
	model.flush();
	return model;
}

describe('PanelGroupModel', () => {
	test('batches drag notifications until endDrag and marks them as user interactions', () => {
		const onLayoutChanged = jest.fn();
		const model = createPanelGroupModel({ direction: 'horizontal', onLayoutChanged });
		model.registerPanel(panel('left', { defaultSize: 50 }));
		model.registerPanel(panel('right', { defaultSize: 50 }));
		model.registerHandle('handle');
		model.flush();
		onLayoutChanged.mockClear();

		model.beginDrag('handle', 1000);
		model.drag(50);
		model.drag(100);
		expect(onLayoutChanged).not.toHaveBeenCalled();
		model.endDrag();

		expect(onLayoutChanged).toHaveBeenCalledTimes(1);
		expect(onLayoutChanged).toHaveBeenCalledWith([60, 40], { isUserInteraction: true });
	});

	test('marks imperative commits as non-user interactions', () => {
		const onLayoutChanged = jest.fn();
		const model = createPanelGroupModel({ direction: 'horizontal', onLayoutChanged });
		model.registerPanel(panel('left', { defaultSize: 50 }));
		model.registerPanel(panel('right', { defaultSize: 50 }));
		model.flush();
		onLayoutChanged.mockClear();

		model.resizePanel('left', 60);

		expect(onLayoutChanged).toHaveBeenCalledWith([60, 40], { isUserInteraction: false });
	});

	test('resets the panel before a handle to its default size as a user interaction', () => {
		const onLayoutChanged = jest.fn();
		const model = createPanelGroupModel({ direction: 'horizontal', onLayoutChanged });
		model.registerPanel(panel('left', { defaultSize: 40 }));
		model.registerPanel(panel('right', { defaultSize: 60 }));
		model.registerHandle('handle');
		model.flush();
		model.setLayout([60, 40]);
		onLayoutChanged.mockClear();

		model.resetPanelToDefault('handle');

		expect(model.getLayout()).toEqual([40, 60]);
		expect(onLayoutChanged).toHaveBeenCalledWith([40, 60], { isUserInteraction: true });
	});

	test('does not reset a panel without a default size', () => {
		const model = modelWithPanels(panel('left'), panel('right'));
		model.registerHandle('handle');
		model.setLayout([60, 40]);

		model.resetPanelToDefault('handle');

		expect(model.getLayout()).toEqual([60, 40]);
	});

	test('nudges a handle by percentage points as a user interaction', () => {
		const onLayoutChanged = jest.fn();
		const model = createPanelGroupModel({ direction: 'horizontal', onLayoutChanged });
		model.registerPanel(panel('left', { defaultSize: 50 }));
		model.registerPanel(panel('right', { defaultSize: 50 }));
		model.registerHandle('handle');
		model.flush();
		onLayoutChanged.mockClear();

		model.nudge('handle', 5);

		expect(model.getLayout()).toEqual([55, 45]);
		expect(onLayoutChanged).toHaveBeenCalledWith([55, 45], { isUserInteraction: true });
	});

	test('reports separator ARIA values constrained by both adjacent panels', () => {
		const model = modelWithPanels(
			panel('left', { defaultSize: 50, minSize: 20, maxSize: 70 }),
			panel('right', { defaultSize: 50, minSize: 10, maxSize: 80 })
		);
		model.registerHandle('handle');

		expect(model.getSeparatorAriaValues('handle')).toEqual({
			valueMin: 20,
			valueMax: 70,
			valueNow: 50,
		});
	});

	test('toggles the collapsible panel before a handle as a user interaction', () => {
		const onLayoutChanged = jest.fn();
		const model = createPanelGroupModel({ direction: 'horizontal', onLayoutChanged });
		model.registerPanel(panel('left', { collapsible: true, defaultSize: 40, minSize: 20 }));
		model.registerPanel(panel('right', { defaultSize: 60 }));
		model.registerHandle('handle');
		model.flush();
		onLayoutChanged.mockClear();

		model.toggleCollapseAdjacent('handle');
		expect(model.getLayout()).toEqual([0, 100]);
		model.toggleCollapseAdjacent('handle');

		expect(model.getLayout()).toEqual([40, 60]);
		expect(onLayoutChanged).toHaveBeenNthCalledWith(1, [0, 100], {
			isUserInteraction: true,
		});
		expect(onLayoutChanged).toHaveBeenNthCalledWith(2, [40, 60], {
			isUserInteraction: true,
		});
	});

	test('does not notify onLayoutChanged for an unchanged drag', () => {
		const onLayoutChanged = jest.fn();
		const model = createPanelGroupModel({ direction: 'horizontal', onLayoutChanged });
		model.registerPanel(panel('left', { defaultSize: 50 }));
		model.registerPanel(panel('right', { defaultSize: 50 }));
		model.registerHandle('handle');
		model.flush();
		onLayoutChanged.mockClear();

		model.beginDrag('handle', 1000);
		model.drag(100);
		model.drag(0);
		model.endDrag();

		expect(onLayoutChanged).not.toHaveBeenCalled();
	});

	test('flushes one three-panel registration batch into one default layout notification', () => {
		const onLayout = jest.fn();
		const model = createPanelGroupModel({ direction: 'horizontal', onLayout });
		model.registerPanel(panel('a', { defaultSize: 20 }));
		model.registerPanel(panel('b'));
		model.registerPanel(panel('c', { defaultSize: 30 }));

		model.flush();

		expect(model.getLayout()).toEqual([20, 50, 30]);
		expect(onLayout).toHaveBeenCalledTimes(1);
		expect(onLayout).toHaveBeenCalledWith([20, 50, 30]);
	});

	test('sorts panels with the existing order comparator', () => {
		const model = createPanelGroupModel({ direction: 'horizontal' });
		model.registerPanel(panel('two', { defaultSize: 50 }, { order: 2 }));
		model.registerPanel(panel('unordered', { defaultSize: 20 }));
		model.registerPanel(panel('one', { defaultSize: 30 }, { order: 1 }));
		model.flush();

		expect(model.getPanelIds()).toEqual(['unordered', 'one', 'two']);
		expect(model.getLayout()).toEqual([20, 30, 50]);
	});

	test('sorts panels and handles by measured position when no child has an order', () => {
		const model = createPanelGroupModel({ direction: 'horizontal' });
		model.registerPanel(panel('third', { defaultSize: 40 }));
		model.registerPanel(panel('first', { defaultSize: 30 }));
		model.registerPanel(panel('second', { defaultSize: 30 }));
		model.registerHandle('second-handle');
		model.registerHandle('first-handle');
		model.setPositions({
			first: 0,
			'first-handle': 100,
			second: 200,
			'second-handle': 300,
			third: 400,
		});
		model.flush();

		expect(model.getPanelIds()).toEqual(['first', 'second', 'third']);
		expect(model.beginDrag('second-handle', 1000)).toBe(true);
		model.drag(100);
		expect(model.getLayout()).toEqual([30, 40, 30]);
	});

	test('uses registration order when measured positions are incomplete', () => {
		const model = createPanelGroupModel({ direction: 'horizontal' });
		model.registerPanel(panel('second'));
		model.registerPanel(panel('first'));
		model.setPositions({ first: 0 });
		model.flush();

		expect(model.getPanelIds()).toEqual(['second', 'first']);
	});

	test('setPositions does not dirty the model when ordering is unchanged', () => {
		const model = modelWithPanels(panel('first'), panel('second'));
		expect(model.isDirty()).toBe(false);

		model.setPositions({ first: 0, second: 100 });

		expect(model.isDirty()).toBe(false);
	});

	test('relayouts on the next microtask when nothing flushes explicitly', async () => {
		const onLayout = jest.fn();
		const model = createPanelGroupModel({ direction: 'horizontal', onLayout });
		model.registerPanel(panel('a'));
		model.registerPanel(panel('b'));
		model.registerPanel(panel('c'));
		expect(model.getLayout()).toEqual([]);

		await Promise.resolve();

		expect(model.getPanelIds()).toEqual(['a', 'b', 'c']);
		expect(model.getLayout()).toHaveLength(3);
		expect(onLayout).toHaveBeenCalledTimes(1);

		model.unregisterPanel('b');
		await Promise.resolve();

		expect(model.getLayout()).toEqual([50, 50]);
		expect(onLayout).toHaveBeenCalledTimes(2);
	});

	test('relayouts remaining panels after unregisterPanel and flush', () => {
		const model = modelWithPanels(panel('a'), panel('b'), panel('c'));

		model.unregisterPanel('b');
		model.flush();

		expect(model.getPanelIds()).toEqual(['a', 'c']);
		expect(model.getLayout()).toEqual([50, 50]);
	});

	test('uses the second handle position as pivots for the second and third panels', () => {
		const model = modelWithPanels(
			panel('a', { defaultSize: 30 }),
			panel('b', { defaultSize: 30 }),
			panel('c', { defaultSize: 40 })
		);
		model.registerHandle('first');
		model.registerHandle('second');

		expect(model.beginDrag('second', 1000)).toBe(true);
		model.drag(100);

		expect(model.getLayout()).toEqual([30, 40, 30]);
	});

	test('keeps handle pivots correct after unregistering and remounting the same handle', () => {
		const model = modelWithPanels(
			panel('a', { defaultSize: 30 }),
			panel('b', { defaultSize: 30 }),
			panel('c', { defaultSize: 40 })
		);
		model.registerHandle('first');
		model.registerHandle('second');
		model.unregisterHandle('second');
		model.registerHandle('second');

		expect(model.beginDrag('second', 1000)).toBe(true);
		model.drag(100);

		expect(model.getLayout()).toEqual([30, 40, 30]);
	});

	test('sorts out-of-order handles by order before resolving pivots', () => {
		const model = modelWithPanels(
			panel('a', { defaultSize: 30 }),
			panel('b', { defaultSize: 30 }),
			panel('c', { defaultSize: 40 })
		);
		model.registerHandle('second', 2);
		model.registerHandle('first', 1);

		expect(model.beginDrag('second', 1000)).toBe(true);
		model.drag(100);

		expect(model.getLayout()).toEqual([30, 40, 30]);
	});

	test('converts a 100px drag in a 1000px container to ten percentage points', () => {
		const model = modelWithPanels(
			panel('left', { defaultSize: 50 }),
			panel('right', { defaultSize: 50 })
		);
		model.registerHandle('handle');

		model.beginDrag('handle', 1000);
		model.drag(100);

		expect(model.getLayout()).toEqual([60, 40]);
	});

	test('respects panel minimum sizes while dragging', () => {
		const model = modelWithPanels(
			panel('left', { defaultSize: 50 }),
			panel('right', { defaultSize: 50, minSize: 45 })
		);
		model.registerHandle('handle');

		model.beginDrag('handle', 1000);
		model.drag(100);

		expect(model.getLayout()).toEqual([55, 45]);
	});

	test('resolves pixel minimum sizes against the container size', () => {
		const model = modelWithPanels(panel('left', { minSize: '300px' }), panel('right'));
		model.setContainerSize(1000);

		model.setLayout([20, 80]);

		expect(model.getLayout()).toEqual([30, 70]);
	});

	test('defers a pixel default until the first non-zero container size', () => {
		const model = modelWithPanels(panel('left', { defaultSize: '300px' }), panel('right'));
		expect(model.getLayout()).toEqual([50, 50]);

		model.setContainerSize(1000);

		expect(model.getLayout()).toEqual([30, 70]);
	});

	test('revalidates pixel constraints when the container size changes', () => {
		const model = modelWithPanels(
			panel('left', { defaultSize: 30, minSize: '300px' }),
			panel('right', { defaultSize: 70 })
		);
		model.setContainerSize(1000);

		model.setContainerSize(500);

		expect(model.getLayout()).toEqual([60, 40]);
	});

	test('preserves a pixel-sized panel when the container grows', () => {
		const model = modelWithPanels(
			panel('products', { defaultSize: 60 }),
			panel('cart', { defaultSize: 40, groupResizeBehavior: 'preserve-pixel-size' })
		);
		model.setContainerSize(1000);

		model.setContainerSize(2000);

		expect(model.getLayout()).toEqual([80, 20]);
	});

	test('disabled panels keep their size during drag but allow imperative resize', () => {
		const model = modelWithPanels(
			panel('left', { defaultSize: 30 }),
			panel('middle', { defaultSize: 40, disabled: true }),
			panel('right', { defaultSize: 30 })
		);
		model.registerHandle('first');
		model.registerHandle('second');

		model.beginDrag('first', 1000);
		model.drag(-100);
		model.endDrag();
		expect(model.getPanelSize('middle')).toBe(40);

		model.resizePanel('middle', 50);
		expect(model.getPanelSize('middle')).toBe(50);
	});

	test('rejects beginDrag when the container size is zero', () => {
		const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
		const model = modelWithPanels(panel('left'), panel('right'));
		model.registerHandle('handle');

		expect(model.beginDrag('handle', 0)).toBe(false);
		expect(model.isDragging()).toBe(false);
		expect(warning).toHaveBeenCalledWith(
			'[react-native-resizable-panels] Cannot drag handle "handle" in a 0px container'
		);
		warning.mockRestore();
	});

	test('rejects beginDrag for an unknown handle', () => {
		const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
		const model = modelWithPanels(panel('left'), panel('right'));

		expect(model.beginDrag('missing', 1000)).toBe(false);
		expect(model.isDragging()).toBe(false);
		expect(warning).toHaveBeenCalled();
		warning.mockRestore();
	});

	test('collapse then expand restores the size from before collapse', () => {
		const model = modelWithPanels(
			panel('left', { collapsible: true, defaultSize: 40, minSize: 20 }),
			panel('right', { defaultSize: 60 })
		);

		model.collapsePanel('left');
		expect(model.getLayout()).toEqual([0, 100]);
		model.expandPanel('left');

		expect(model.getLayout()).toEqual([40, 60]);
	});

	test('reports collapsed and expanded panel state', () => {
		const model = modelWithPanels(
			panel('left', { collapsible: true, defaultSize: 40, minSize: 20 }),
			panel('right', { defaultSize: 60 })
		);

		expect(model.isPanelCollapsed('left')).toBe(false);
		expect(model.isPanelExpanded('left')).toBe(true);
		model.collapsePanel('left');
		expect(model.isPanelCollapsed('left')).toBe(true);
		expect(model.isPanelExpanded('left')).toBe(false);
	});

	test('resizePanel changes the requested panel size', () => {
		const model = modelWithPanels(
			panel('left', { defaultSize: 50 }),
			panel('right', { defaultSize: 50 })
		);

		model.resizePanel('left', 70);

		expect(model.getLayout()).toEqual([70, 30]);
		expect(model.getPanelSize('left')).toBe(70);
	});

	test('setLayout validates the requested layout against constraints', () => {
		const model = modelWithPanels(panel('left', { minSize: 40 }), panel('right'));

		model.setLayout([20, 80]);

		expect(model.getLayout()).toEqual([40, 60]);
	});

	test('reevaluatePanelConstraints clamps a panel to a raised minimum size', () => {
		const left = panel('left', { defaultSize: 30, minSize: 0 });
		const model = modelWithPanels(left, panel('right', { defaultSize: 70 }));
		const prevConstraints = { ...left.constraints };
		left.constraints.minSize = 40;

		model.reevaluatePanelConstraints('left', prevConstraints);

		expect(model.getLayout()).toEqual([40, 60]);
	});

	test('onResize receives size and previous size only when the size changes', () => {
		const onResize = jest.fn();
		const model = modelWithPanels(
			panel('left', { defaultSize: 40 }, { callbacks: { onResize } }),
			panel('right', { defaultSize: 60 })
		);
		expect(onResize).toHaveBeenLastCalledWith(40, undefined);
		onResize.mockClear();

		model.setLayout([40, 60]);
		model.resizePanel('left', 50);
		model.resizePanel('left', 50);

		expect(onResize).toHaveBeenCalledTimes(1);
		expect(onResize).toHaveBeenCalledWith(50, 40);
	});

	test('onCollapse and onExpand fire when the panel crosses its collapsed size', () => {
		const onCollapse = jest.fn();
		const onExpand = jest.fn();
		const model = modelWithPanels(
			panel(
				'left',
				{ collapsible: true, defaultSize: 40, minSize: 20 },
				{ callbacks: { onCollapse, onExpand } }
			),
			panel('right', { defaultSize: 60 })
		);
		onCollapse.mockClear();
		onExpand.mockClear();

		model.collapsePanel('left');
		model.expandPanel('left');

		expect(onCollapse).toHaveBeenCalledTimes(1);
		expect(onExpand).toHaveBeenCalledTimes(1);
	});
});
