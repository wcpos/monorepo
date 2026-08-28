/** @jest-environment jsdom */

import React from 'react';

import { act, render, waitFor } from '@testing-library/react';

import { type ImperativePanelHandle, Panel } from './Panel';
import { type ImperativePanelGroupHandle, PanelGroup } from './PanelGroup';
import { PanelResizeHandle } from './PanelResizeHandle';
import { gestureRegistry } from './test/gesture-handler-mock';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Jest mock factories are hoisted
jest.mock('react-native-reanimated', () => require('./test/reanimated-mock'));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Jest mock factories are hoisted
jest.mock('react-native-gesture-handler', () => require('./test/gesture-handler-mock'));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Jest mock factories are hoisted
jest.mock('react-native-worklets', () => require('./test/react-native-worklets-mock'));

class ImmediateResizeObserver implements ResizeObserver {
	constructor(private readonly callback: ResizeObserverCallback) {}

	observe(target: Element) {
		this.callback([{ target } as ResizeObserverEntry], this);
	}
	unobserve() {}
	disconnect() {}
}

async function waitForContainerLayout() {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

async function dragLatestHandle(translationX = 100) {
	await waitForContainerLayout();
	const gesture = gestureRegistry.at(-1);
	expect(gesture).toBeDefined();
	act(() => {
		gesture?.begin?.();
		gesture?.update?.({ translationX, translationY: 0 });
		gesture?.end?.();
		gesture?.finalize?.();
	});
}

beforeAll(() => {
	window.ResizeObserver = ImmediateResizeObserver;
	Object.defineProperties(HTMLElement.prototype, {
		offsetWidth: { configurable: true, get: () => 1000 },
		offsetHeight: { configurable: true, get: () => 500 },
	});
});

beforeEach(() => {
	gestureRegistry.length = 0;
});

test('initial panel flexGrow follows defaultSize', async () => {
	const view = render(
		<PanelGroup direction="horizontal" testID="group">
			<Panel testID="left" defaultSize={30} />
			<PanelResizeHandle />
			<Panel testID="right" defaultSize={70} />
		</PanelGroup>
	);

	await waitFor(() => expect(view.getByTestId('left').style.flexGrow).toBe('30'));
	expect(view.getByTestId('right').style.flexGrow).toBe('70');
});

test('imperative Panel collapse and expand update panel styles', async () => {
	const panelRef = React.createRef<ImperativePanelHandle>();
	const view = render(
		<PanelGroup direction="horizontal" testID="group">
			<Panel ref={panelRef} testID="left" collapsible defaultSize={40} minSize={20} />
			<PanelResizeHandle />
			<Panel testID="right" defaultSize={60} />
		</PanelGroup>
	);
	await waitFor(() => expect(view.getByTestId('left').style.flexGrow).toBe('40'));

	act(() => panelRef.current?.collapse());
	await waitFor(() => expect(view.getByTestId('left').style.flexGrow).toBe('0'));
	act(() => panelRef.current?.expand());

	await waitFor(() => expect(view.getByTestId('left').style.flexGrow).toBe('40'));
});

test('imperative PanelGroup setLayout updates panel styles', async () => {
	const groupRef = React.createRef<ImperativePanelGroupHandle>();
	const view = render(
		<PanelGroup ref={groupRef} direction="horizontal" testID="group">
			<Panel testID="left" defaultSize={50} />
			<PanelResizeHandle />
			<Panel testID="right" defaultSize={50} />
		</PanelGroup>
	);
	await waitFor(() => expect(view.getByTestId('left').style.flexGrow).toBe('50'));

	act(() => groupRef.current?.setLayout([25, 75]));

	await waitFor(() => expect(view.getByTestId('left').style.flexGrow).toBe('25'));
	expect(view.getByTestId('right').style.flexGrow).toBe('75');
});

test('recorded gesture updates layout percentages and calls onLayout', async () => {
	const onLayout = jest.fn();
	const view = render(
		<PanelGroup direction="horizontal" onLayout={onLayout} testID="group">
			<Panel testID="left" defaultSize={50} />
			<PanelResizeHandle />
			<Panel testID="right" defaultSize={50} />
		</PanelGroup>
	);
	await waitFor(() => expect(view.getByTestId('left').style.flexGrow).toBe('50'));
	onLayout.mockClear();

	await dragLatestHandle();

	await waitFor(() => expect(view.getByTestId('left').style.flexGrow).toBe('60'));
	expect(onLayout).toHaveBeenCalledWith([60, 40]);
});

test('finalized gesture restores panel interaction and reports dragging ended', async () => {
	const onDragging = jest.fn();
	const view = render(
		<PanelGroup direction="horizontal" testID="group">
			<Panel testID="left" defaultSize={50} />
			<PanelResizeHandle onDragging={onDragging} />
			<Panel testID="right" defaultSize={50} />
		</PanelGroup>
	);
	await waitForContainerLayout();
	const gesture = gestureRegistry.at(-1);

	act(() => gesture?.begin?.());
	expect(view.getByTestId('left').style.pointerEvents).toBe('none');
	expect(onDragging).toHaveBeenLastCalledWith(true);

	act(() => gesture?.finalize?.());
	expect(view.getByTestId('left').style.pointerEvents).toBe('auto');
	expect(onDragging).toHaveBeenLastCalledWith(false);
});

test('disabled handle ignores recorded gesture updates', async () => {
	const view = render(
		<PanelGroup direction="horizontal" testID="group">
			<Panel testID="left" defaultSize={50} />
			<PanelResizeHandle disabled />
			<Panel testID="right" defaultSize={50} />
		</PanelGroup>
	);
	await waitFor(() => expect(view.getByTestId('left').style.flexGrow).toBe('50'));

	await dragLatestHandle();

	expect(view.getByTestId('left').style.flexGrow).toBe('50');
	expect(view.getByTestId('right').style.flexGrow).toBe('50');
});

test('remounted handle still drags the two panels on its right and left', async () => {
	function Harness() {
		const [showSecondHandle, setShowSecondHandle] = React.useState(true);
		return (
			<>
				<button data-testid="toggle" onClick={() => setShowSecondHandle((value) => !value)} />
				<PanelGroup direction="horizontal" testID="group">
					<Panel testID="first" defaultSize={30} />
					<PanelResizeHandle />
					<Panel testID="second" defaultSize={30} />
					{showSecondHandle ? <PanelResizeHandle /> : null}
					<Panel testID="third" defaultSize={40} />
				</PanelGroup>
			</>
		);
	}
	const view = render(<Harness />);
	await waitFor(() => expect(view.getByTestId('first').style.flexGrow).toBe('30'));

	act(() => view.getByTestId('toggle').click());
	act(() => view.getByTestId('toggle').click());
	await dragLatestHandle();

	expect(view.getByTestId('first').style.flexGrow).toBe('30');
	await waitFor(() => expect(view.getByTestId('second').style.flexGrow).toBe('40'));
	expect(view.getByTestId('third').style.flexGrow).toBe('30');
});

test('Panel rendered outside PanelGroup throws', () => {
	const error = jest.spyOn(console, 'error').mockImplementation(() => {});
	expect(() => render(<Panel />)).toThrow('<Panel> must be rendered inside a <PanelGroup>');
	error.mockRestore();
});

/**
 * The POS split from apps/main (#1620): both panels carry complementary defaultSizes so the
 * pre-layout fallback style (flexGrow = defaultSize ?? 1) is already the correct ratio, and the
 * group's onLayout feeds the persisted width back in. Pins that the model flushes exactly one
 * layout for the batch, hands the same ratio to the animated styles, and does not re-fire
 * onLayout when the persisted width re-renders the tree with unchanged props.
 */
test('POS shape: complementary defaultSizes land as one layout and re-render idempotently', async () => {
	const onLayout = jest.fn();
	function PosSplit({ width }: { width: number }) {
		return (
			<PanelGroup direction="horizontal" onLayout={onLayout} testID="group">
				<Panel testID="products" defaultSize={width} minSize={25} id="products" />
				<PanelResizeHandle />
				<Panel testID="cart" defaultSize={100 - width} minSize={25} id="cart" />
			</PanelGroup>
		);
	}
	const view = render(<PosSplit width={60} />);

	await waitFor(() => expect(view.getByTestId('products').style.flexGrow).toBe('60'));
	expect(view.getByTestId('cart').style.flexGrow).toBe('40');
	expect(onLayout).toHaveBeenCalledTimes(1);
	expect(onLayout).toHaveBeenCalledWith([60, 40]);

	// patchUI({ width: 60 }) re-renders the screen with the same width.
	view.rerender(<PosSplit width={60} />);
	await waitForContainerLayout();

	expect(onLayout).toHaveBeenCalledTimes(1);
	expect(view.getByTestId('products').style.flexGrow).toBe('60');
	expect(view.getByTestId('cart').style.flexGrow).toBe('40');
});

test('POS shape: a persisted width outside the constraints is clamped, not rendered as a sliver', async () => {
	const onLayout = jest.fn();
	const view = render(
		<PanelGroup direction="horizontal" onLayout={onLayout} testID="group">
			<Panel testID="products" defaultSize={90} minSize={25} id="products" />
			<PanelResizeHandle />
			<Panel testID="cart" defaultSize={10} minSize={25} id="cart" />
		</PanelGroup>
	);

	await waitFor(() => expect(view.getByTestId('products').style.flexGrow).toBe('75'));
	expect(view.getByTestId('cart').style.flexGrow).toBe('25');
	expect(onLayout).toHaveBeenCalledWith([75, 25]);
});
