/** @jest-environment jsdom */
import * as React from 'react';
import type { ViewProps } from 'react-native';

import { act, render, screen } from '@testing-library/react';

type Style = { opacity?: number; transform?: Record<string, number>[] };
type TimingCall = {
	toValue: number;
	duration: number;
	easing?: unknown;
	done?: (finished: boolean) => void;
};
const mockTimings: TimingCall[] = [];
const mockDelays: number[] = [];
const mockShared: { value: number }[] = [];
const mockCancelled: { value: number }[] = [];
const mockStyles = new Map<string, () => Style>();
const mockLayouts: NonNullable<ViewProps['onLayout']>[] = [];
// The stage's own frame in the window; a tile's frame is given relative to the same window.
const STAGE = { x: 10, y: 20 };

const flatten = (style: unknown): Record<string, unknown> =>
	Object.assign({}, ...(Array.isArray(style) ? style.flat() : [style]).filter(Boolean));

jest.mock('react-native', () => {
	const ReactActual = jest.requireActual('react');
	return {
		Platform: { OS: 'web' },
		View: ReactActual.forwardRef(function View(
			{ children, onLayout, testID, style, ...rest }: ViewProps,
			ref: React.Ref<unknown>
		) {
			const node: React.RefObject<HTMLDivElement | null> = ReactActual.useRef(null);
			// A view measures as the stage does, and knows what it contains, as a DOM node does.
			ReactActual.useImperativeHandle(ref, () => ({
				measureInWindow: (callback: (x: number, y: number) => void) => callback(STAGE.x, STAGE.y),
				contains: (other: Node) => node.current?.contains(other) ?? false,
			}));
			if (onLayout) mockLayouts.push(onLayout);
			return (
				<div
					ref={node}
					data-testid={testID}
					data-pointer={flatten(style).pointerEvents as string}
					aria-hidden={rest['aria-hidden']}
				>
					{children}
				</div>
			);
		}),
	};
});
jest.mock('react-native-worklets', () => ({
	scheduleOnRN: (callback: (...args: unknown[]) => void, ...args: unknown[]) => callback(...args),
}));
jest.mock('react-native-reanimated', () => {
	const ReactActual = jest.requireActual('react');
	let ids = 0;
	return {
		__esModule: true,
		default: {
			View: ({ children, style, ...rest }: ViewProps) => {
				const flat = flatten(style);
				const id = ReactActual.useRef(`style-${ids++}`).current;
				if (typeof flat.factory === 'function') mockStyles.set(id, flat.factory as () => Style);
				return (
					<div
						data-style={id}
						data-visibility={(flat.visibility as string) ?? 'visible'}
						data-pointer={flat.pointerEvents as string}
						data-front={flat.zIndex === 1}
						data-opacity={flat.opacity as number}
						aria-hidden={rest['aria-hidden']}
					>
						{children}
					</div>
				);
			},
		},
		// A curve is its points, so a test can tell the motion library's easings apart.
		Easing: { bezier: (...points: number[]) => points.join(',') },
		ReduceMotion: { System: 'system' },
		cancelAnimation: (shared: { value: number }) => {
			mockCancelled.push(shared);
		},
		useAnimatedStyle: (factory: () => Style) => ({ factory }),
		useSharedValue: (value: number) => {
			const shared = ReactActual.useRef({ value }).current;
			// The clocks only: a cell's offset (an object) is read through its style, not driven.
			if (typeof value === 'number' && !mockShared.includes(shared)) mockShared.push(shared);
			return shared;
		},
		withDelay: (delay: number, value: number) => {
			mockDelays.push(delay);
			return value;
		},
		withTiming: (
			toValue: number,
			config: { duration: number; easing?: unknown },
			done?: (finished: boolean) => void
		) => {
			mockTimings.push({ toValue, duration: config.duration, easing: config.easing, done });
			return toValue;
		},
	};
});

/* eslint-disable import/first */
import { BEATS, EASE, EASE_EXIT, PANE } from '@wcpos/components/lib/motion';

import {
	DealCell,
	DealFade,
	DealStack,
	DealStagedContext,
	type Measurable,
	useDeal,
} from './deal-stack';
/* eslint-enable import/first */

const TILE = { x: 110, y: 220, width: 92, height: 150 };
const tile: Measurable = {
	measureInWindow: (callback) => callback(TILE.x, TILE.y, TILE.width, TILE.height),
};
// Where the dealt grid's slots rest, within the stage: on a card 9 px in from the stage's edge
// (the 8 px gutter plus its hairline), under a 40 px breadcrumb and the card's top hairline.
const GRID = { x: 9, y: 41, width: 382, height: 300 };
// A node whose measurement the platform answers later: the test fires it when it chooses.
const pending: { fire: (() => void) | null } = { fire: null };
const slowSlots: Measurable = {
	measureInWindow: (callback) => {
		pending.fire = () => callback(STAGE.x + 99, STAGE.y + 99, 50, 50);
	},
};
const COLUMNS = 4;
// One column of the grid's own width, not the stage's.
const COLUMN = GRID.width / COLUMNS;

function Lifted() {
	return <output data-testid="lifted">{String(React.useContext(DealStagedContext))}</output>;
}
function Pane({
	name,
	count,
	scroll,
	rowTops,
}: {
	name: string;
	count: number;
	scroll?: { value: number };
	rowTops?: Record<number, number>;
}) {
	const { origin, dealt, grid, placeGrid } = useDeal();
	// The pane's breadcrumb takes focus when it mounts, in a passive effect, as the real one does.
	const crumb = React.useRef<HTMLButtonElement>(null);
	React.useEffect(() => crumb.current?.focus(), []);
	// The grid reports the node its slots rest in: a card inset from the stage, under the crumb.
	const slots: Measurable = {
		measureInWindow: (callback) =>
			callback(STAGE.x + GRID.x, STAGE.y + GRID.y, GRID.width, GRID.height),
	};
	return (
		<>
			<button ref={crumb} data-testid="crumb-laid-out" onClick={() => placeGrid(slots)} />
			<button data-testid="measure-slowly" onClick={() => placeGrid(slowSlots)} />
			<output data-testid="deal">
				{JSON.stringify({
					name,
					dealt,
					origin: origin ?? String(origin),
					grid: grid ?? String(grid),
				})}
			</output>
			<DealFade>
				<span data-testid="furniture" />
			</DealFade>
			{Array.from({ length: count }, (_, index) => (
				<DealCell
					key={index}
					index={index}
					count={count}
					columns={COLUMNS}
					scroll={scroll as never}
					restY={rowTops?.[Math.floor(index / COLUMNS)]}
				>
					<span data-testid={`cell-${index}`} />
				</DealCell>
			))}
		</>
	);
}
function Stage({
	detail,
	target = tile,
	count = 6,
	scroll,
	rowTops,
}: {
	detail: string | null;
	target?: Measurable;
	count?: number;
	scroll?: { value: number };
	rowTops?: Record<number, number>;
}) {
	return (
		<DealStack
			testID="stage"
			detail={detail}
			target={target}
			renderDetail={(name) => <Pane name={name} count={count} scroll={scroll} rowTops={rowTops} />}
		>
			<Lifted />
		</DealStack>
	);
}

const deal = () => JSON.parse(screen.getByTestId('deal').textContent!);
// The parent's visibility is a plain style (committed with the lift), not a worklet prop.
const seen = (testID: string) =>
	screen.getByTestId(testID).closest('[data-style]')!.getAttribute('data-opacity') !== '0';
const styleOf = (testID: string) =>
	mockStyles.get(
		screen.getByTestId(testID).closest('[data-style]')!.getAttribute('data-style')!
	)!();
const layOut = () =>
	act(() => {
		mockLayouts.at(-1)!({ nativeEvent: { layout: { width: 400 } } } as never);
		screen.getByTestId('crumb-laid-out').click();
	});
const finish = (toValue: number, finished = true) =>
	act(() => {
		mockTimings.filter((call) => call.toValue === toValue && call.done).at(-1)!.done!(finished);
	});

beforeEach(() => {
	jest.useFakeTimers();
	mockTimings.length = 0;
	mockDelays.length = 0;
	mockShared.length = 0;
	mockCancelled.length = 0;
	mockStyles.clear();
	mockLayouts.length = 0;
	jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
		callback(0);
		return 1;
	});
});
afterEach(() => {
	jest.useRealTimers();
	jest.restoreAllMocks();
});

it('shows only the root at rest and deals nothing on mount', () => {
	render(<Stage detail={null} />);
	expect(screen.queryByTestId('deal')).toBeNull();
	expect(screen.getByTestId('lifted').textContent).toBe('null');
	// The only timings are the no-op settles to the resting values: furniture away, products shown.
	expect(mockTimings.map((call) => call.toValue)).toEqual([0, 1]);
});

it('lays the detail out unseen, then deals from the tapped tile once both frames are known', () => {
	const { rerender } = render(<Stage detail={null} />);
	rerender(<Stage detail="Hoodie" />);
	// The tile's frame is in, relative to the stage; the pane has not said where its grid starts.
	expect(deal()).toEqual({
		name: 'Hoodie',
		dealt: false,
		origin: { x: TILE.x - STAGE.x, y: TILE.y - STAGE.y, width: 92, height: 150 },
		grid: 'undefined',
	});
	// Nothing has set off: no furniture deal (the one `1` with a callback) and no products fade.
	expect(mockTimings.some((call) => call.toValue === 1 && call.done)).toBe(false);
	expect(mockTimings.some((call) => call.toValue === 0 && !call.done)).toBe(false);
	// The copy is not shown until it also knows how far down the grid starts: with the frame
	// alone it has no offset and would paint at rest, then snap (Android, 2026-10-05) — and the
	// tapped tile does not step aside before the copy can stand on it, or the slot is empty.
	expect(seen('cell-0')).toBe(false);
	expect(screen.getByTestId('lifted').textContent).toBe('null');

	layOut();
	expect(deal().dealt).toBe(true);
	// Both on the same frame: the copy stands on the tile and the tile steps aside.
	expect(seen('cell-0')).toBe(true);
	expect(screen.getByTestId('lifted').textContent).toBe('Hoodie');
	// The products are out of reach from the tap, and hidden once they have faded.
	const root = screen.getByTestId('lifted').closest('[data-style]') as HTMLElement;
	expect(root.dataset.pointer).toBe('none');
	expect(root.dataset.visibility).toBe('visible');
	finish(1);
	expect(root.dataset.visibility).toBe('hidden');
});

it('starts the parent exactly on the tapped tile and every other tile underneath it', () => {
	const scroll = { value: 0 };
	const { rerender } = render(<Stage detail={null} scroll={scroll} />);
	rerender(<Stage detail="Hoodie" scroll={scroll} />);
	layOut();
	const [furniture, products, ...cells] = mockShared;
	expect(furniture.value).toBe(1);
	expect(products.value).toBe(0);

	// Undealt: slot 0 sits on the tile's frame. Its own slot is the grid's first cell, inside the
	// card's measured frame — not the stage's first cell, which the card is inset from.
	cells.forEach((cell) => (cell.value = 0));
	expect(seen('cell-0')).toBe(true);
	expect(styleOf('cell-0')).toEqual({
		transform: [{ translateX: 100 - (GRID.x + 4) }, { translateY: 200 - (GRID.y + 4) }],
	});
	// Slot 5 is column 1 of row 1: one grid column across, one tile-and-margins down.
	const under = styleOf('cell-5');
	expect(under.opacity).toBe(0);
	expect(under.transform).toEqual([
		{ translateX: 100 - (GRID.x + COLUMN + 4) },
		{ translateY: 200 - (GRID.y + 158 + 4) },
		{ scale: 0.92 },
	]);
	// Only the parent's row and the parent itself are raised.
	expect(screen.getByTestId('cell-0').closest('[data-style]')!.getAttribute('data-front')).toBe(
		'true'
	);
	expect(screen.getByTestId('cell-5').closest('[data-style]')!.getAttribute('data-front')).toBe(
		'false'
	);

	// Dealt: everything is where the layout put it.
	cells.forEach((cell) => (cell.value = 1));
	expect(styleOf('cell-0').transform).toEqual([{ translateX: 0 }, { translateY: 0 }]);
	expect(styleOf('cell-5')).toEqual({
		opacity: 1,
		transform: [{ translateX: -0 }, { translateY: -0 }, { scale: 1 }],
	});

	// A scrolled grid gathers from where its tiles are on screen.
	scroll.value = 30;
	cells.forEach((cell) => (cell.value = 0));
	expect(styleOf('cell-0').transform![1]).toEqual({ translateY: 200 - (GRID.y + 4) + 30 });

	// A first frame stamped before the animation's start lets the easing overshoot the ends;
	// the cell never leaves the line between the tapped tile and its slot (Android, 2026-10-05:
	// the parent was thrown off the left of the screen for two frames on the way home).
	scroll.value = 0;
	cells.forEach((cell) => (cell.value = 1.2));
	expect(styleOf('cell-0').transform).toEqual([{ translateX: 0 }, { translateY: 0 }]);
	expect(styleOf('cell-5')).toEqual({
		opacity: 1,
		transform: [{ translateX: -0 }, { translateY: -0 }, { scale: 1 }],
	});
	cells.forEach((cell) => (cell.value = -0.2));
	expect(styleOf('cell-0').transform).toEqual([
		{ translateX: 100 - (GRID.x + 4) },
		{ translateY: 200 - (GRID.y + 4) },
	]);
	expect(styleOf('cell-5').opacity).toBe(0);
	expect(styleOf('cell-5').transform![2]).toEqual({ scale: 0.92 });
});

it('starts a cell under a taller row from the row top the grid measured, not from equal rows', () => {
	// Term tiles in row 0, product tiles with SKU and stock lines below: row 1 starts 230 px down,
	// not the tapped tile's 158. Row 0 is not given, so its cells keep the arithmetic.
	const rowTops = { 1: 230 };
	const { rerender } = render(<Stage detail={null} rowTops={rowTops} />);
	rerender(<Stage detail="Hoodie" rowTops={rowTops} />);
	layOut();
	const [, , ...cells] = mockShared;
	cells.forEach((cell) => (cell.value = 0));
	expect(styleOf('cell-0').transform).toEqual([
		{ translateX: 100 - (GRID.x + 4) },
		{ translateY: 200 - (GRID.y + 4) },
	]);
	// Slot 5 (row 1) starts from under the parent: its offset reaches back from where it rests.
	expect(styleOf('cell-5').transform).toEqual([
		{ translateX: 100 - (GRID.x + COLUMN + 4) },
		{ translateY: 200 - (GRID.y + 230 + 4) },
		{ scale: 0.92 },
	]);
});

it('deals in order on the beat, capped, and gathers last-out-first', () => {
	const { rerender } = render(<Stage detail={null} count={12} />);
	rerender(<Stage detail="Hoodie" count={12} />);
	mockTimings.length = 0;
	layOut();
	const { step, cap, duration } = BEATS.newTiles;
	// Eleven variations: the first leaves at once, the rest a step apart until the cap.
	expect(mockDelays.slice(-11)).toEqual(
		Array.from({ length: 11 }, (_, turn) => Math.min(turn, cap - 1) * step)
	);
	// The products leave on the furniture's clock; then the parent walks and the tiles deal.
	const out = mockTimings.filter((call) => !call.done).map((call) => call.duration);
	expect(out).toEqual([
		BEATS.oldTiles.duration,
		PANE,
		...Array.from({ length: 11 }, () => duration),
	]);
	// Nothing on the way out takes longer than the 400 ms the cashier will wait.
	expect((cap - 1) * step + duration).toBeLessThanOrEqual(400);

	mockDelays.length = 0;
	rerender(<Stage detail={null} count={12} />);
	const back = BEATS.oldTiles;
	// Last out, first home.
	expect(mockDelays).toEqual(
		Array.from({ length: 11 }, (_, index) => Math.min(10 - index, back.cap - 1) * back.step)
	);
	// The products, the breadcrumb and the parent come back on one clock.
	expect(mockTimings.filter((call) => call.toValue === 0).at(-1)!.duration).toBe(PANE);
});

it('deals in place when the tile cannot be measured, without losing the tap', () => {
	const { rerender } = render(<Stage detail={null} target={null} />);
	rerender(<Stage detail="Hoodie" target={null} />);
	expect(deal()).toEqual({ name: 'Hoodie', dealt: false, origin: 'undefined', grid: 'undefined' });
	// Unmeasured, the parent is not shown anywhere yet.
	expect(seen('cell-0')).toBe(false);
	act(() => jest.advanceTimersByTime(120));
	// Neither frame could be measured: the grace period deals in place, on the stage itself.
	expect(deal()).toEqual({ name: 'Hoodie', dealt: true, origin: 'null', grid: 'null' });
	expect(seen('cell-0')).toBe(true);
	expect(styleOf('cell-0')).toEqual({ transform: [{ translateX: 0 }, { translateY: 0 }] });
	// No frame to stand on, so the products' own tile stays where it is.
	expect(screen.getByTestId('lifted').textContent).toBe('null');
});

it('keeps the detail on stage until its tiles are home, then puts the tile back', () => {
	const { rerender } = render(<Stage detail={null} />);
	rerender(<Stage detail="Hoodie" />);
	layOut();
	finish(1);
	rerender(<Stage detail={null} />);
	expect(deal().dealt).toBe(false);
	expect(screen.getByTestId('lifted').textContent).toBe('Hoodie');
	const root = screen.getByTestId('lifted').closest('[data-style]') as HTMLElement;
	expect(root.dataset.visibility).toBe('visible');
	expect(root.dataset.pointer).toBe('auto');
	finish(0);
	expect(screen.queryByTestId('deal')).toBeNull();
	expect(screen.getByTestId('lifted').textContent).toBe('null');
});

it('a return interrupted by another tile stops the return clock, keeping the new measurement', () => {
	const { rerender } = render(<Stage detail={null} />);
	rerender(<Stage detail="Hoodie" />);
	layOut();
	rerender(<Stage detail={null} />);
	const [furniture, under] = mockShared;
	mockCancelled.length = 0;
	rerender(<Stage detail="Tee" />);
	// Hoodie's return would have cleared the stage when it ran out, measurement and all.
	expect(mockCancelled).toContain(furniture);
	expect(mockCancelled).toContain(under);
	// A cancelled return reports `finished: false` and leaves the new deal alone.
	finish(0, false);
	expect(deal()).toMatchObject({
		name: 'Tee',
		origin: { x: TILE.x - STAGE.x, y: TILE.y - STAGE.y },
	});
});

it('a grid measurement that lands after another detail opened is ignored', () => {
	const { rerender } = render(<Stage detail={null} />);
	rerender(<Stage detail="Hoodie" />);
	// Hoodie's grid asks to be measured; the platform has not answered yet.
	act(() => screen.getByTestId('measure-slowly').click());
	expect(deal().grid).toBe('undefined');
	// The cashier opens Tee before the answer arrives.
	rerender(<Stage detail="Tee" />);
	act(() => pending.fire!());
	// Hoodie's frame does not become Tee's; Tee's own report does.
	expect(deal()).toMatchObject({ name: 'Tee', grid: 'undefined' });
	layOut();
	expect(deal().grid).toEqual(GRID);
});

it('a grid measurement that lands after the grace period dealt in place does not move the deal', () => {
	const { rerender } = render(<Stage detail={null} />);
	rerender(<Stage detail="Hoodie" />);
	act(() => screen.getByTestId('measure-slowly').click());
	// The platform is slow: the grace period deals on the stage itself.
	act(() => jest.advanceTimersByTime(120));
	expect(deal()).toMatchObject({ dealt: true, grid: 'null' });
	// The answer arrives with the tiles in the air; this deal keeps the frame it set off with.
	act(() => pending.fire!());
	expect(deal().grid).toBe('null');
});

it('the worklet laid down before the frames are known already stands the parent on the tapped tile', () => {
	// On web the mapper keeps running the worklet it started with until a passive effect restarts
	// it, and a heavy commit lets the browser paint first: a closed-over offset painted the parent
	// at its own slot on the frame UNSEEN dropped (web film, 2026-10-06). The offset the parent
	// first shows at must reach the worklet that is already running.
	const { rerender } = render(<Stage detail={null} />);
	rerender(<Stage detail="Hoodie" />);
	const id = screen.getByTestId('cell-0').closest('[data-style]')!.getAttribute('data-style')!;
	const mounted = mockStyles.get(id)!;
	layOut();
	expect(seen('cell-0')).toBe(true);
	const [, , ...cells] = mockShared;
	cells.forEach((cell) => (cell.value = 0));
	expect(mounted()).toEqual({
		transform: [{ translateX: 100 - (GRID.x + 4) }, { translateY: 200 - (GRID.y + 4) }],
	});
});

it('a cell in the air keeps going when the slot count changes under it', () => {
	const { rerender } = render(<Stage detail={null} count={4} />);
	rerender(<Stage detail="Hoodie" count={4} />);
	layOut();
	const [, ...cells] = mockShared;
	// Mid-flight: nothing has landed.
	cells.forEach((cell) => (cell.value = 0.5));
	const timings = mockTimings.length;
	const delays = mockDelays.length;
	// A cold query fills in: the grid gains a slot, so every cell's `count` changes.
	rerender(<Stage detail="Hoodie" count={5} />);
	// The four cells already going are not sent off again; only the new slot starts (at rest).
	expect(mockTimings.length).toBe(timings);
	expect(mockDelays.length).toBe(delays);
	expect(mockShared.at(-1)!.value).toBe(1);
});

it('a return interrupted by the same tile leaves the detail mounted', () => {
	const { rerender } = render(<Stage detail={null} />);
	rerender(<Stage detail="Hoodie" />);
	layOut();
	rerender(<Stage detail={null} />);
	rerender(<Stage detail="Hoodie" />);
	// The cancelled return reports `finished: false`; it must not unmount what is being dealt.
	finish(0, false);
	expect(deal()).toMatchObject({ name: 'Hoodie', dealt: true });
});

it('hides a gathering grid from the accessibility tree and gives focus back to the tapped tile', () => {
	const stage = (detail: string | null) => (
		<>
			<button data-testid="tapped-tile" />
			<input data-testid="search" />
			<Stage detail={detail} />
		</>
	);
	const { rerender } = render(stage(null));
	screen.getByTestId('tapped-tile').focus();
	rerender(stage('Hoodie'));
	const grid = () => screen.getByTestId('deal').closest('[aria-hidden]')!;
	expect(grid().getAttribute('aria-hidden')).toBe('false');
	// The crumb took focus on mount; the opener on record is still the tile, not the crumb.
	expect(document.activeElement).toBe(screen.getByTestId('crumb-laid-out'));
	rerender(stage(null));
	// Still on stage for the gather, but already gone to a screen reader.
	expect(grid().getAttribute('aria-hidden')).toBe('true');
	expect(document.activeElement).toBe(screen.getByTestId('tapped-tile'));
	// Focus that moved somewhere live before the return (typing in a search field closed the
	// deal) stays where it is.
	rerender(stage('Hoodie'));
	screen.getByTestId('search').focus();
	rerender(stage(null));
	expect(document.activeElement).toBe(screen.getByTestId('search'));
});

it('fades the furniture and the products on their own values, clamped', () => {
	const { rerender } = render(<Stage detail={null} />);
	rerender(<Stage detail="Hoodie" />);
	const [furniture, under] = mockShared;
	furniture.value = -0.1;
	expect(styleOf('furniture').opacity).toBe(0);
	furniture.value = 1.1;
	expect(styleOf('furniture').opacity).toBe(1);
	under.value = 1.1;
	expect(styleOf('lifted').opacity).toBe(1);
	under.value = -0.1;
	expect(styleOf('lifted').opacity).toBe(0);
});

it('brings the products back over the whole return, accelerating, so they stay dim while the tiles gather', () => {
	const { rerender } = render(<Stage detail={null} />);
	rerender(<Stage detail="Hoodie" />);
	layOut();
	mockTimings.length = 0;
	rerender(<Stage detail={null} />);
	const back = mockTimings.find((call) => call.toValue === 1 && !call.done);
	// The parent's clock, not the furniture's shorter one, and an accelerating curve: at the
	// last gathered tile (210 ms of 280) the products are about two thirds in, not full.
	expect(back).toMatchObject({ duration: PANE, easing: EASE_EXIT });
	expect(back!.easing).not.toBe(EASE);
	// The furniture still leaves on the parent's clock, decelerating, and clears the stage.
	expect(mockTimings.find((call) => call.toValue === 0 && call.done)).toMatchObject({
		duration: PANE,
		easing: EASE,
	});
});
