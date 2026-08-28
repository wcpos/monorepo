/** @jest-environment jsdom */

import React from 'react';

import { act, fireEvent, render, waitFor } from '@testing-library/react';

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
	const gesture = [...gestureRegistry].reverse().find(({ type }) => type === 'pan');
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
		offsetWidth: {
			configurable: true,
			get(this: HTMLElement) {
				return this.dataset.testid?.includes('handle') ? 8 : 1000;
			},
		},
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

test('measured handle expands its fine-pointer hit target and honors an override', async () => {
	const view = render(
		<PanelGroup direction="horizontal" testID="group">
			<Panel defaultSize={50} />
			<PanelResizeHandle testID="handle" />
			<Panel defaultSize={50} />
		</PanelGroup>
	);

	await waitFor(() => {
		const pan = [...gestureRegistry].reverse().find(({ type }) => type === 'pan');
		expect(pan?.hitSlopValue).toEqual({ left: 9.5, right: 9.5 });
	});

	view.rerender(
		<PanelGroup direction="horizontal" testID="group">
			<Panel defaultSize={50} />
			<PanelResizeHandle testID="handle-override" hitTargetSize={48} />
			<Panel defaultSize={50} />
		</PanelGroup>
	);

	await waitFor(() => {
		const pan = [...gestureRegistry].reverse().find(({ type }) => type === 'pan');
		expect(pan?.hitSlopValue).toEqual({ left: 20, right: 20 });
	});

	view.rerender(
		<PanelGroup direction="horizontal" testID="group">
			<Panel defaultSize={50} />
			<PanelResizeHandle testID="handle-disabled-target" hitTargetSize={0} />
			<Panel defaultSize={50} />
		</PanelGroup>
	);

	await waitForContainerLayout();
	const pan = [...gestureRegistry].reverse().find(({ type }) => type === 'pan');
	expect(pan?.hitSlopValue).toBeUndefined();
});

test('recorded double tap resets the panel before the handle', async () => {
	const groupRef = React.createRef<ImperativePanelGroupHandle>();
	const view = render(
		<PanelGroup ref={groupRef} direction="horizontal" testID="group">
			<Panel testID="left" defaultSize={40} />
			<PanelResizeHandle testID="handle" />
			<Panel testID="right" defaultSize={60} />
		</PanelGroup>
	);
	await waitFor(() => expect(view.getByTestId('left').style.flexGrow).toBe('40'));
	act(() => groupRef.current?.setLayout([60, 40]));
	await waitFor(() => expect(view.getByTestId('left').style.flexGrow).toBe('60'));

	const doubleTap = [...gestureRegistry]
		.reverse()
		.find(({ numberOfTapsValue, type }) => type === 'tap' && numberOfTapsValue === 2);
	act(() => doubleTap?.end?.());

	await waitFor(() => expect(view.getByTestId('left').style.flexGrow).toBe('40'));
	expect(view.getByTestId('right').style.flexGrow).toBe('60');
});

test('disableDoubleTap omits the double-tap gesture', async () => {
	render(
		<PanelGroup direction="horizontal">
			<Panel defaultSize={50} />
			<PanelResizeHandle disableDoubleTap />
			<Panel defaultSize={50} />
		</PanelGroup>
	);
	await waitForContainerLayout();

	expect(gestureRegistry.some(({ type }) => type === 'tap')).toBe(false);
});

test.each([
	['handle', false, true],
	['group', true, false],
] as const)(
	'disabled %s ignores a recorded double tap',
	async (_label, groupDisabled, handleDisabled) => {
		const groupRef = React.createRef<ImperativePanelGroupHandle>();
		const view = render(
			<PanelGroup ref={groupRef} direction="horizontal" disabled={groupDisabled}>
				<Panel testID="left" defaultSize={40} />
				<PanelResizeHandle disabled={handleDisabled} />
				<Panel testID="right" defaultSize={60} />
			</PanelGroup>
		);
		await waitFor(() => expect(view.getByTestId('left').style.flexGrow).toBe('40'));
		act(() => groupRef.current?.setLayout([60, 40]));
		await waitFor(() => expect(view.getByTestId('left').style.flexGrow).toBe('60'));

		const doubleTap = [...gestureRegistry]
			.reverse()
			.find(({ numberOfTapsValue, type }) => type === 'tap' && numberOfTapsValue === 2);
		act(() => doubleTap?.end?.());

		expect(view.getByTestId('left').style.flexGrow).toBe('60');
	}
);

test('web separator keyboard resize updates layout and aria-valuenow', async () => {
	const view = render(
		<PanelGroup direction="horizontal" testID="group">
			<Panel testID="left" defaultSize={50} />
			<PanelResizeHandle testID="handle" />
			<Panel testID="right" defaultSize={50} />
		</PanelGroup>
	);
	const handle = view.getByTestId('handle');
	await waitFor(() => expect(handle.getAttribute('aria-valuenow')).toBe('50'));

	fireEvent.keyDown(handle, { key: 'ArrowRight' });

	await waitFor(() => expect(view.getByTestId('left').style.flexGrow).toBe('55'));
	expect(handle.getAttribute('aria-valuenow')).toBe('55');
	expect(handle.getAttribute('role')).toBe('separator');
	expect(handle.getAttribute('aria-orientation')).toBe('horizontal');
});

test('onLayoutChanged batches a gesture and marks it as a user interaction', async () => {
	const onLayoutChanged = jest.fn();
	const view = render(
		<PanelGroup direction="horizontal" onLayoutChanged={onLayoutChanged} testID="group">
			<Panel testID="left" defaultSize={50} />
			<PanelResizeHandle />
			<Panel testID="right" defaultSize={50} />
		</PanelGroup>
	);
	await waitFor(() => expect(view.getByTestId('left').style.flexGrow).toBe('50'));
	expect(onLayoutChanged).toHaveBeenLastCalledWith([50, 50], { isUserInteraction: false });
	onLayoutChanged.mockClear();

	await dragLatestHandle();

	expect(onLayoutChanged).toHaveBeenCalledTimes(1);
	expect(onLayoutChanged).toHaveBeenCalledWith([60, 40], { isUserInteraction: true });
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
	const gesture = [...gestureRegistry].reverse().find(({ type }) => type === 'pan');

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

test('disabled group ignores recorded gesture updates', async () => {
	const view = render(
		<PanelGroup direction="horizontal" disabled testID="group">
			<Panel testID="left" defaultSize={50} />
			<PanelResizeHandle />
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

test('measured positions order a panel and handle inserted in the middle', async () => {
	const rect = jest
		.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
		.mockImplementation(function (this: HTMLElement) {
			const leftByTestId: Record<string, number> = {
				first: 0,
				'first-handle': 100,
				middle: 200,
				'middle-handle': 300,
				last: 400,
			};
			const left = leftByTestId[this.dataset.testid ?? ''] ?? 0;
			return {
				bottom: 0,
				height: 0,
				left,
				right: 0,
				top: 0,
				width: 0,
				x: left,
				y: 0,
				toJSON: () => ({}),
			};
		});
	function Harness() {
		const [showMiddle, setShowMiddle] = React.useState(false);
		return (
			<>
				<button data-testid="insert" onClick={() => setShowMiddle(true)} />
				<PanelGroup direction="horizontal" testID="group">
					<Panel testID="first" defaultSize={30} />
					<PanelResizeHandle testID="first-handle" />
					{showMiddle ? <Panel testID="middle" defaultSize={30} /> : null}
					{showMiddle ? <PanelResizeHandle testID="middle-handle" /> : null}
					<Panel testID="last" defaultSize={showMiddle ? 40 : 70} />
				</PanelGroup>
			</>
		);
	}
	const view = render(<Harness />);
	act(() => view.getByTestId('insert').click());
	await waitFor(() => expect(view.getByTestId('middle').style.flexGrow).toBe('30'));

	await dragLatestHandle();

	expect(view.getByTestId('first').style.flexGrow).toBe('30');
	expect(view.getByTestId('middle').style.flexGrow).toBe('40');
	expect(view.getByTestId('last').style.flexGrow).toBe('30');
	rect.mockRestore();
});

test('all-zero measured positions fall back to registration order', async () => {
	const view = render(
		<PanelGroup direction="horizontal" testID="group">
			<Panel testID="left" defaultSize={50} />
			<PanelResizeHandle testID="handle" />
			<Panel testID="right" defaultSize={50} />
		</PanelGroup>
	);
	await dragLatestHandle();

	await waitFor(() => expect(view.getByTestId('left').style.flexGrow).toBe('60'));
	expect(view.getByTestId('right').style.flexGrow).toBe('40');
});

test('Panel rendered outside PanelGroup throws', () => {
	const error = jest.spyOn(console, 'error').mockImplementation(() => {});
	expect(() => render(<Panel />)).toThrow('<Panel> must be rendered inside a <PanelGroup>');
	error.mockRestore();
});

/**
 * The POS split from apps/main (#1620): both panels carry complementary defaultSizes so the
 * pre-layout fallback style (flexGrow = defaultSize ?? 1) is already the correct ratio, and the
 * group's onLayoutChanged feeds user-driven persisted width back in. Pins that the model flushes exactly one
 * layout for the batch, hands the same ratio to the animated styles, and does not re-fire
 * onLayout when the persisted width re-renders the tree with unchanged props.
 */
test('POS shape: complementary defaultSizes land as one layout and re-render idempotently', async () => {
	const patchUI = jest.fn();
	const onLayoutChanged = jest.fn(
		([productsWidth]: number[], { isUserInteraction }: { isUserInteraction: boolean }) => {
			if (isUserInteraction) patchUI({ width: productsWidth });
		}
	);
	function PosSplit({ width }: { width: number }) {
		return (
			<PanelGroup direction="horizontal" onLayoutChanged={onLayoutChanged} testID="group">
				<Panel testID="products" defaultSize={width} minSize={25} id="products" />
				<PanelResizeHandle />
				<Panel testID="cart" defaultSize={100 - width} minSize={25} id="cart" />
			</PanelGroup>
		);
	}
	const view = render(<PosSplit width={60} />);

	await waitFor(() => expect(view.getByTestId('products').style.flexGrow).toBe('60'));
	expect(view.getByTestId('cart').style.flexGrow).toBe('40');
	expect(onLayoutChanged).toHaveBeenCalledTimes(1);
	expect(onLayoutChanged).toHaveBeenCalledWith([60, 40], { isUserInteraction: false });
	expect(patchUI).not.toHaveBeenCalled();

	// patchUI({ width: 60 }) re-renders the screen with the same width.
	view.rerender(<PosSplit width={60} />);
	await waitForContainerLayout();

	expect(onLayoutChanged).toHaveBeenCalledTimes(1);
	expect(view.getByTestId('products').style.flexGrow).toBe('60');
	expect(view.getByTestId('cart').style.flexGrow).toBe('40');

	await dragLatestHandle();
	expect(patchUI).toHaveBeenCalledWith({ width: 70 });
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
