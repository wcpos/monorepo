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
// What each clock started at, before any effect drove it: what its first paint shows.
const mockInitial: number[] = [];
const mockCancelled: { value: number }[] = [];
const mockStyles = new Map<string, () => Style>();
const mockLayouts: NonNullable<ViewProps['onLayout']>[] = [];
// Every animated reaction mounted: the UI thread runs them on its frames (`uiFrame`).
const mockReactions = new Set<() => void>();
let mockOS = 'web';
// The live `--spacing` (the tile's `m-1`); unset reads as the Regular step's 4.
let mockSpacing: number | undefined;
jest.mock('uniwind', () => ({ useCSSVariable: () => mockSpacing }));
// The stage's own frame in the window; a tile's frame is given relative to the same window.
const STAGE = { x: 10, y: 20 };

const flatten = (style: unknown): Record<string, unknown> =>
	Object.assign({}, ...(Array.isArray(style) ? style.flat() : [style]).filter(Boolean));

jest.mock('react-native', () => {
	const ReactActual = jest.requireActual('react');
	return {
		Platform: {
			get OS() {
				return mockOS;
			},
		},
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
			View: ({ children, style, className, ...rest }: ViewProps & { className?: string }) => {
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
						data-height={flat.height as number}
						data-width={flat.width as number}
						data-flex={flat.flex as number}
						data-class-name={className}
						data-box={JSON.stringify({
							width: flat.width,
							height: flat.height,
							flexGrow: flat.flexGrow,
							flexShrink: flat.flexShrink,
							flexBasis: flat.flexBasis,
						})}
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
		// The UI thread sees what a commit's layout effects wrote once that commit is done: here, in a
		// passive effect after every render, and again on every `uiFrame`.
		useAnimatedReaction: <T,>(prepare: () => T, react: (now: T, was: T | null) => void) => {
			const last = ReactActual.useRef(null as T | null);
			ReactActual.useEffect(() => {
				const run = () => {
					const now = prepare();
					if (now === last.current) return;
					const was = last.current;
					last.current = now;
					react(now, was);
				};
				mockReactions.add(run);
				run();
				return () => {
					mockReactions.delete(run);
				};
			});
		},
		useSharedValue: (value: number) => {
			const shared = ReactActual.useRef({ value }).current;
			// The clocks only: a cell's offset (an object) is read through its style, not driven.
			if (typeof value === 'number' && !mockShared.includes(shared)) {
				mockShared.push(shared);
				mockInitial.push(value);
			}
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

import { FIRST_FRAME_DELAY } from './first-frame';
import {
	DealCell,
	DealFade,
	DealStack,
	DealStagedContext,
	type Measurable,
	useAirspace,
	useCopyPicture,
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

// How many times the parent tile's body has mounted (a fresh layout each time).
let mockBodyMounts = 0;
function Body() {
	React.useEffect(() => {
		mockBodyMounts += 1;
	}, []);
	return null;
}
// A picture on the parent tile: it paints when the test says so.
function Picture() {
	const painted = useCopyPicture();
	return (
		<button data-testid="paint" data-on-copy={String(!!painted)} onClick={() => painted?.()} />
	);
}
// What the grid's scroller and the frame around it are given.
function Air({ scroll }: { scroll: { value: number } }) {
	return <output data-testid="air">{JSON.stringify(useAirspace(scroll as never))}</output>;
}
function Lifted() {
	return <output data-testid="lifted">{String(React.useContext(DealStagedContext))}</output>;
}
function Pane({
	name,
	count,
	scroll,
	rowTops,
	picture,
}: {
	name: string;
	count: number;
	scroll?: { value: number };
	rowTops?: Record<number, number>;
	picture?: boolean;
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
					{index === 0 && picture ? <Picture /> : null}
					{index === 0 ? <Body /> : null}
				</DealCell>
			))}
			{scroll ? <Air scroll={scroll} /> : null}
		</>
	);
}
function Stage({
	detail,
	target = tile,
	count = 6,
	scroll,
	rowTops,
	collapse,
	picture,
}: {
	detail: string | null;
	target?: Measurable;
	count?: number;
	scroll?: { value: number };
	rowTops?: Record<number, number>;
	collapse?: boolean;
	picture?: boolean;
}) {
	return (
		<DealStack
			testID="stage"
			detail={detail}
			target={target}
			collapse={collapse}
			renderDetail={(name) => (
				<Pane name={name} count={count} scroll={scroll} rowTops={rowTops} picture={picture} />
			)}
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
	mockInitial.length = 0;
	mockCancelled.length = 0;
	mockStyles.clear();
	mockLayouts.length = 0;
	mockReactions.clear();
	mockOS = 'web';
	mockSpacing = undefined;
	mockBodyMounts = 0;
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
	// Eleven variations: the first leaves on the first painted frame (never on receipt, which a
	// delay of 0 would mean), the rest a step apart until the cap.
	expect(mockDelays.slice(-11)).toEqual(
		Array.from({ length: 11 }, (_, turn) => FIRST_FRAME_DELAY + Math.min(turn, cap - 1) * step)
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
	// Last out, first home — after the parent's walk, and before the stage's two clocks, each of
	// which starts on its own first frame (first-frame.ts, whose test pins what that means).
	expect(mockDelays).toEqual([
		FIRST_FRAME_DELAY,
		...Array.from(
			{ length: 11 },
			(_, index) => FIRST_FRAME_DELAY + Math.min(10 - index, back.cap - 1) * back.step
		),
		FIRST_FRAME_DELAY,
		FIRST_FRAME_DELAY,
	]);
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
	// The four cells already going are not sent off again; only the new slot sets off.
	expect(mockTimings.length).toBe(timings + 1);
	expect(mockDelays.length).toBe(delays + 1);
});

it('a cell that mounts mid-deal joins it from under the parent; one after the deal landed is at rest', () => {
	const { rerender } = render(<Stage detail={null} count={4} />);
	rerender(<Stage detail="Hoodie" count={4} />);
	layOut();
	const timings = mockTimings.length;
	// The deal is in the air when the answer brings a fifth slot: it is not painted at rest
	// among tiles still flying, but starts unseen under the parent and is dealt at once, its
	// turn in the stagger long gone.
	rerender(<Stage detail="Hoodie" count={5} />);
	expect(mockInitial.at(-1)).toBe(0);
	// Its turn has come: no beat to wait for, only the first painted frame.
	expect(mockDelays.at(-1)).toBe(FIRST_FRAME_DELAY);
	expect(mockTimings.slice(timings)).toEqual([
		expect.objectContaining({ toValue: 1, duration: BEATS.newTiles.duration }),
	]);
	// The last tile has landed: a slot that mounts now (the list's next batch) is where it
	// belongs, and nothing animates on mount.
	act(() =>
		jest.advanceTimersByTime(
			(BEATS.newTiles.cap - 1) * BEATS.newTiles.step + BEATS.newTiles.duration
		)
	);
	const landed = mockTimings.length;
	rerender(<Stage detail="Hoodie" count={6} />);
	expect(mockInitial.at(-1)).toBe(1);
	expect(mockTimings.length).toBe(landed);
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

it('a collapsing stack cross-fades its detail out and the root in; nothing travels home', () => {
	const { rerender } = render(<Stage detail={null} />);
	rerender(<Stage detail="Hoodie" />);
	layOut();
	finish(1);
	expect(styleOf('deal').opacity).toBe(1);
	const timings = mockTimings.length;
	const delays = mockDelays.length;
	rerender(<Stage detail={null} collapse />);
	// The tiles are not turned for home: no stagger, no walk, the deal stays dealt. The only
	// delays are the fade's two clocks starting on their first frame.
	expect(deal().dealt).toBe(true);
	expect(mockDelays.slice(delays)).toEqual([FIRST_FRAME_DELAY, FIRST_FRAME_DELAY]);
	// One clock: the detail out where it stands, the products in over it.
	expect(mockTimings.slice(timings)).toEqual([
		expect.objectContaining({
			toValue: 0,
			duration: PANE,
			easing: EASE,
			done: expect.any(Function),
		}),
		expect.objectContaining({ toValue: 1, duration: PANE, easing: EASE }),
	]);
	expect(styleOf('deal').opacity).toBe(0);
	expect(styleOf('lifted').opacity).toBe(1);
	// No copy walks home onto the tapped tile, so it is back in the root that fades in.
	expect(screen.getByTestId('lifted').textContent).toBe('null');
	// The detail stays mounted until the fade ends, as a gather's does.
	expect(screen.getByTestId('deal')).toBeTruthy();
	finish(0);
	expect(screen.queryByTestId('deal')).toBeNull();
});

it('the next detail after a cross-fade starts from rest: its veil up, its furniture down', () => {
	const { rerender } = render(<Stage detail={null} />);
	rerender(<Stage detail="Hoodie" />);
	layOut();
	finish(1);
	rerender(<Stage detail={null} collapse />);
	finish(0);
	expect(screen.queryByTestId('deal')).toBeNull();
	const [furniture, , veil] = mockShared;
	// The fade left its veil down.
	expect(veil.value).toBe(0);

	// The next detail, before its deal sets off: shown (the veil up), its crumb and footer still
	// to join the deal (the furniture down) — not hidden then snapping in, nor there whole.
	rerender(<Stage detail="Beanie" collapse />);
	expect(veil.value).toBe(1);
	expect(furniture.value).toBe(0);
	expect(styleOf('deal').opacity).toBe(1);
	expect(styleOf('furniture').opacity).toBe(0);
	layOut();
	expect(furniture.value).toBe(1);
});

it('a detail staged after a cross-fade has its clocks at rest before it first paints', () => {
	// What the detail's own first effects see: every layout effect (the stack's reset among them)
	// has run by then, but no parent's passive effect yet — the frame it is painted in.
	const firstSeen: { veil: number; furniture: number }[] = [];
	function Probe() {
		React.useEffect(() => {
			const [furniture, , veil] = mockShared;
			firstSeen.push({ veil: veil.value, furniture: furniture.value });
		}, []);
		return null;
	}
	function Probed({ detail, collapse }: { detail: string | null; collapse?: boolean }) {
		return (
			<DealStack
				testID="stage"
				detail={detail}
				target={tile}
				collapse={collapse}
				renderDetail={(name) => (
					<>
						<Pane name={name} count={2} />
						{name === 'Beanie' ? <Probe /> : null}
					</>
				)}
			>
				<Lifted />
			</DealStack>
		);
	}
	const { rerender } = render(<Probed detail={null} />);
	rerender(<Probed detail="Hoodie" />);
	layOut();
	finish(1);
	rerender(<Probed detail={null} collapse />);
	finish(0); // the fade completes: the veil stays down
	rerender(<Probed detail="Beanie" collapse />);
	expect(firstSeen).toEqual([{ veil: 1, furniture: 0 }]);
});

it('a detail opened during a cross-fade is shown whole and its furniture joins its deal', () => {
	const { rerender } = render(<Stage detail={null} />);
	rerender(<Stage detail="Hoodie" />);
	layOut();
	finish(1);
	rerender(<Stage detail={null} collapse />);
	const [furniture, , veil] = mockShared;
	// Mid-fade: the leaving detail's veil going down, its furniture still up.
	expect(veil.value).toBe(0);
	expect(furniture.value).toBe(1);
	rerender(<Stage detail="Beanie" collapse />);
	expect(veil.value).toBe(1);
	expect(furniture.value).toBe(0);
});

// On the fade's FIRST frame its `withTiming(0)` has not advanced: the veil still reads 1. A tile
// opened then must still find every clock cancelled and at rest, and the old fade, running out a
// frame later under the new detail, must not clear it.
it('a tile opened on the first frame of a cross-fade is shown whole, and the old fade does not clear it', () => {
	const { rerender } = render(<Stage detail={null} />);
	rerender(<Stage detail="Hoodie" />);
	layOut();
	finish(1);
	rerender(<Stage detail={null} collapse />);
	const fade = mockTimings.filter((call) => call.toValue === 0 && call.done).at(-1)!;
	const [furniture, under, veil] = mockShared;
	// The clocks were started but have not advanced: the veil still up, the furniture still up.
	veil.value = 1;
	furniture.value = 1;
	mockCancelled.length = 0;
	rerender(<Stage detail="Beanie" collapse />);
	// Cancelled before anything was read, and put at rest for the new detail.
	expect(mockCancelled).toEqual(expect.arrayContaining([veil, furniture, under]));
	expect(veil.value).toBe(1);
	expect(furniture.value).toBe(0);
	expect(styleOf('deal').opacity).toBe(1);
	expect(deal().name).toBe('Beanie');
	// The old fade runs out anyway (its cancel came a frame late): it clears nothing of Beanie's.
	act(() => fade.done!(true));
	expect(screen.getByTestId('deal')).toBeTruthy();
	expect(deal().name).toBe('Beanie');
});

it('a stack inside a detail that cross-fades away holds what it shows', () => {
	function Nested({ inner, collapse }: { inner: string | null; collapse?: boolean }) {
		return (
			<DealStack
				testID="outer"
				detail={inner === null ? null : 'Clothing'}
				target={tile}
				collapse={collapse}
				renderDetail={() => (
					<DealStack
						testID="inner"
						detail={inner}
						target={tile}
						renderDetail={(name) => <output data-testid="inner-detail">{name}</output>}
					>
						<span data-testid="inner-root" />
					</DealStack>
				)}
			>
				<span data-testid="outer-root" />
			</DealStack>
		);
	}
	const { rerender } = render(<Nested inner={null} />);
	rerender(<Nested inner="Tees" />);
	const innerRoot = () => screen.getByTestId('inner-root').closest('[data-style]')!;
	expect(innerRoot().getAttribute('aria-hidden')).toBe('true');
	const delays = mockDelays.length;
	// The path is cut two levels at once: both stacks' details clear in the same render.
	rerender(<Nested inner={null} collapse />);
	// The inner stack does not gather or bring its own root back: it is frozen as it was, and
	// leaves with the surface that holds it.
	expect(screen.getByTestId('inner-detail').textContent).toBe('Tees');
	expect(innerRoot().getAttribute('aria-hidden')).toBe('true');
	// Only the outer stack's fade clocks (each from its first frame); nothing of the inner stack's.
	expect(mockDelays.slice(delays)).toEqual([FIRST_FRAME_DELAY, FIRST_FRAME_DELAY]);
});

// Android: a React commit carries the props the UI thread has ALREADY applied. A copy shown on
// the commit that wrote its offset painted at its own slot, at rest, for a frame (Pixel,
// 2026-10-06: Tops cold f004, Hoodie f004). It is shown, and the tapped tile steps aside, only
// once a UI frame has run its style with the offset.
it('shows the copy and lifts the tile only after a UI frame has applied the copy’s offset', () => {
	mockOS = 'android';
	const frames: FrameRequestCallback[] = [];
	jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
		frames.push(callback);
		return frames.length;
	});
	const { rerender } = render(<Stage detail={null} />);
	rerender(<Stage detail="Hoodie" />);
	layOut();
	// The frames are known and the worklet has the offset that stands the copy on the tile …
	const [, , , ...cells] = mockShared;
	cells.forEach((cell) => (cell.value = 0));
	expect(styleOf('cell-0').transform).toEqual([
		{ translateX: 100 - (GRID.x + 4) },
		{ translateY: 200 - (GRID.y + 4) },
	]);
	// … but no UI frame has applied it yet: the copy is still unseen, the tile still in place, and
	// nothing has set off.
	expect(seen('cell-0')).toBe(false);
	expect(screen.getByTestId('lifted').textContent).toBe('null');
	expect(deal().dealt).toBe(false);
	// The frame after the one that ran the style: shown and lifted in one commit.
	act(() => frames.splice(0).forEach((frame) => frame(0)));
	expect(seen('cell-0')).toBe(true);
	expect(screen.getByTestId('lifted').textContent).toBe('Hoodie');
	act(() => frames.splice(0).forEach((frame) => frame(0)));
	expect(deal().dealt).toBe(true);
});

it('a copy placed for a detail that has since been replaced does not show the new one', () => {
	mockOS = 'android';
	const frames: FrameRequestCallback[] = [];
	jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
		frames.push(callback);
		return frames.length;
	});
	const { rerender } = render(<Stage detail={null} />);
	rerender(<Stage detail="Hoodie" />);
	layOut();
	const late = frames.splice(0);
	// Another tile is tapped before Hoodie's copy reports.
	rerender(<Stage detail="Tee" />);
	act(() => late.forEach((frame) => frame(0)));
	expect(deal().name).toBe('Tee');
	// Tee's frames are known, its own copy has not been applied by a UI frame yet: Hoodie's
	// report must not stand in for it.
	layOut();
	expect(seen('cell-0')).toBe(false);
	expect(screen.getByTestId('lifted').textContent).toBe('null');
	act(() => frames.splice(0).forEach((frame) => frame(0)));
	expect(seen('cell-0')).toBe(true);
	expect(screen.getByTestId('lifted').textContent).toBe('Tee');
});

it('holds the copy until its picture has painted, and only so long', () => {
	mockOS = 'android';
	const { rerender } = render(<Stage detail={null} picture />);
	rerender(<Stage detail="Hoodie" picture />);
	expect(screen.getByTestId('paint').dataset.onCopy).toBe('true');
	layOut();
	// The frames are known, the picture has not painted: the copy would show a blank square.
	expect(seen('cell-0')).toBe(false);
	expect(screen.getByTestId('lifted').textContent).toBe('null');
	act(() => screen.getByTestId('paint').click());
	expect(seen('cell-0')).toBe(true);
	expect(screen.getByTestId('lifted').textContent).toBe('Hoodie');
	expect(deal().dealt).toBe(true);

	// A picture that never paints holds the deal for its grace period only.
	rerender(<Stage detail={null} picture />);
	finish(0);
	rerender(<Stage detail="Tee" picture />);
	layOut();
	expect(seen('cell-0')).toBe(false);
	act(() => jest.advanceTimersByTime(150));
	expect(seen('cell-0')).toBe(true);
});

// The web's mapper reruns in the commit's microtask, before the paint: waiting a frame for a
// report, or for `onDisplay` (a frame after the load on web), only made every deal start later.
it('on the web the copy is shown, and the tile lifted, in the commit that knows its frames', () => {
	const frames: FrameRequestCallback[] = [];
	jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
		frames.push(callback);
		return frames.length;
	});
	const { rerender } = render(<Stage detail={null} picture />);
	rerender(<Stage detail="Hoodie" picture />);
	expect(screen.getByTestId('paint').dataset.onCopy).toBe('false');
	layOut();
	// No frame has run, and the picture has not reported.
	expect(seen('cell-0')).toBe(true);
	expect(screen.getByTestId('lifted').textContent).toBe('Hoodie');
});

it('a picture off any copy holds nothing', () => {
	render(<Picture />);
	expect(screen.getByTestId('paint').dataset.onCopy).toBe('false');
});

it('the copy keeps the tapped tile’s height in a taller row, both ways; dealt in place it fills its row', () => {
	const box = () => screen.getByTestId('cell-0').closest('[data-style]')!;
	const height = () => box().getAttribute('data-height');
	const { rerender } = render(<Stage detail={null} />);
	rerender(<Stage detail="Hoodie" />);
	layOut();
	// The tile plus its margins, whatever the products beside it in the level's first row make
	// of that row (Pixel, 2026-10-06: Men's copy grew 244 → 431 px on the tapped tile).
	expect(height()).toBe(String(TILE.height + 8));
	// …and its width: a level's column is a fraction of a dp off the root's, and a name that
	// breaks mid-word broke a letter earlier on the copy (Pixel, 2026-10-07, Uncategorized). A
	// fixed box: no share of the row.
	expect(box().getAttribute('data-width')).toBe(String(TILE.width + 8));
	// A fixed box on both engines: no `flex` (neither the class's `flex: 1`, which makes Yoga read
	// an auto basis as 0, nor `flex: 0`, which is `0 1 0%` in CSS and beats the width on the web).
	expect(box().getAttribute('data-flex')).toBeNull();
	expect(box().getAttribute('data-class-name')).toBeNull();
	const pinned = JSON.parse(box().getAttribute('data-box')!);
	expect(pinned).toEqual({
		width: TILE.width + 8,
		height: TILE.height + 8,
		flexGrow: 0,
		flexShrink: 0,
		flexBasis: 'auto',
	});
	// What react-native-web draws for that style: the width, and nothing that overrides it.
	const { View: WebView } = jest.requireActual<{
		View: React.ComponentType<{ testID?: string; style?: object }>;
	}>('react-native-web');
	const { getByTestId } = render(<WebView testID="web-copy" style={pinned} />);
	const drawn = getByTestId('web-copy').style;
	expect(drawn.width).toBe(`${TILE.width + 8}px`);
	expect(drawn.flexBasis).toBe('auto');
	expect(drawn.flexGrow).toBe('0');
	expect(drawn.flexShrink).toBe('0');
	rerender(<Stage detail={null} />);
	expect(height()).toBe(String(TILE.height + 8));
	finish(0);
	rerender(<Stage detail="Tee" target={null} />);
	act(() => jest.advanceTimersByTime(120));
	expect(height()).toBeNull();
});

// The scroller clipped the copy of a tile from the products' first row where it overlapped the
// level's crumb row: its name was cut away for the whole walk (Pixel, 2026-10-06, 1c/1d).
it('lets the tiles in the air out over the crumb, native only, while the grid is at its top', () => {
	mockOS = 'android';
	const scroll = { value: 0 };
	const air = () => JSON.parse(screen.getByTestId('air').textContent!);
	const { rerender } = render(<Stage detail={null} scroll={scroll} />);
	rerender(<Stage detail="Hoodie" scroll={scroll} />);
	layOut();
	// In the air: the scroller lets go, and the frame around it reaches up to the stage's top
	// (the grid's own top within the stage) and clips at the grid's bottom instead.
	expect(air()).toEqual({
		frame: {
			marginTop: -GRID.y,
			paddingTop: GRID.y,
			overflow: 'hidden',
			pointerEvents: 'box-none',
		},
		scroller: { overflow: 'visible' },
	});
	// Landed: the scroller is a scroller again.
	act(() => jest.advanceTimersByTime(1000));
	expect(air()).toEqual({});
	// Scrolled, then on the way home: rows above the grid's top would show over the crumb.
	act(() => {
		scroll.value = 40;
		mockReactions.forEach((run) => run());
	});
	rerender(<Stage detail={null} scroll={scroll} />);
	expect(air()).toEqual({});
	act(() => {
		scroll.value = 0;
		mockReactions.forEach((run) => run());
	});
	expect(air().scroller).toEqual({ overflow: 'visible' });
});

it('the web keeps its scroller: overflow visible would end the scrolling', () => {
	const scroll = { value: 0 };
	const { rerender } = render(<Stage detail={null} scroll={scroll} />);
	rerender(<Stage detail="Hoodie" scroll={scroll} />);
	layOut();
	expect(JSON.parse(screen.getByTestId('air').textContent!)).toEqual({});
});

// A clock set from JS takes its start time when the UI thread receives it; a heavy commit mounted
// before the next frame stamped that frame well into the curve (Pixel, 2026-10-06: a cross-fade's
// first changed frame 61–71% through, the drill-back's walk 41%). Every clock of the stage, and
// the parent's walk, goes through `fromFirstFrame`; first-frame.test.ts pins, against
// Reanimated's own valueSetter and withDelay, that such a clock paints its start on that frame.
it('starts every clock of the deal on its own first frame, out, home and in a cross-fade', () => {
	const { rerender } = render(<Stage detail={null} count={1} />);
	rerender(<Stage detail="Hoodie" count={1} />);
	let delays = mockDelays.length;
	let timings = mockTimings.length;
	layOut();
	// Out: the furniture and the products, then the parent's walk — three clocks, three wraps.
	expect(mockTimings.length - timings).toBe(3);
	expect(mockDelays.slice(delays)).toEqual([
		FIRST_FRAME_DELAY,
		FIRST_FRAME_DELAY,
		FIRST_FRAME_DELAY,
	]);
	delays = mockDelays.length;
	timings = mockTimings.length;
	rerender(<Stage detail={null} count={1} />);
	// Home: the parent's walk, then the furniture and the products.
	expect(mockTimings.length - timings).toBe(3);
	expect(mockDelays.slice(delays)).toEqual([
		FIRST_FRAME_DELAY,
		FIRST_FRAME_DELAY,
		FIRST_FRAME_DELAY,
	]);
	finish(0);
	rerender(<Stage detail="Tee" count={1} />);
	layOut();
	finish(1);
	delays = mockDelays.length;
	timings = mockTimings.length;
	rerender(<Stage detail={null} count={1} collapse />);
	expect(mockTimings.length - timings).toBe(2);
	expect(mockDelays.slice(delays)).toEqual([FIRST_FRAME_DELAY, FIRST_FRAME_DELAY]);
});

// `m-1` is one unit of the live `--spacing`, which the scale step moves: at the Regular 4 on a
// phone whose step drew 3.43 dp, every copy sat 1.5 px up and left of its tile (Pixel, 2026-10-07).
it('starts the copy from the tile by the margin the scale step draws, not the Regular one', () => {
	mockSpacing = 3.5;
	const { rerender } = render(<Stage detail={null} />);
	rerender(<Stage detail="Hoodie" />);
	layOut();
	const [, , , ...cells] = mockShared;
	cells.forEach((cell) => (cell.value = 0));
	expect(styleOf('cell-0').transform).toEqual([
		{ translateX: 100 - (GRID.x + 3.5) },
		{ translateY: 200 - (GRID.y + 3.5) },
	]);
	expect(screen.getByTestId('cell-0').closest('[data-style]')!.getAttribute('data-height')).toBe(
		String(TILE.height + 7)
	);
});

// Android: the commit that closes the detail re-renders the level under it, and mounting it held
// the UI thread on the frame the walk home's clock started: the first painted frame was 59% along
// (Pixel, 2026-10-07, 1b/1d). The tiles turn for home, and the clocks start, a UI frame after it.
it('turns the tiles for home only after a UI frame has followed the closing commit', () => {
	mockOS = 'android';
	const frames: FrameRequestCallback[] = [];
	const run = () => act(() => frames.splice(0).forEach((frame) => frame(0)));
	const { rerender } = render(<Stage detail={null} />);
	jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
		frames.push(callback);
		return frames.length;
	});
	rerender(<Stage detail="Hoodie" />);
	layOut();
	run();
	run();
	expect(deal().dealt).toBe(true);
	const timings = mockTimings.length;
	rerender(<Stage detail={null} />);
	// Heard, not started: still dealt, no clock assigned.
	expect(deal().dealt).toBe(true);
	expect(mockTimings.length).toBe(timings);
	run();
	expect(deal().dealt).toBe(false);
	// Every tile's walk home, then the furniture (which clears the stage) and the products.
	const started = mockTimings.slice(timings);
	expect(started.filter((call) => call.toValue === 0)).toHaveLength(6 + 1);
	expect(started.some((call) => call.toValue === 0 && call.done)).toBe(true);
	expect(started.at(-1)).toMatchObject({ toValue: 1, duration: PANE });
});

it('the web turns for home in the commit that closes', () => {
	const frames: FrameRequestCallback[] = [];
	const { rerender } = render(<Stage detail={null} />);
	rerender(<Stage detail="Hoodie" />);
	layOut();
	jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
		frames.push(callback);
		return frames.length;
	});
	rerender(<Stage detail={null} />);
	expect(deal().dealt).toBe(false);
});

// On Android the copy's words kept the frames of their first layout (the level's column, before
// the tapped tile was measured) when the box was pinned, and the name broke a letter early
// ("Uncatego / rized", Pixel, 2026-10-07). The body is laid out afresh once, at the pinned box.
it('lays the copy’s body out afresh once its box is pinned to the tapped tile', () => {
	const { rerender } = render(<Stage detail={null} />);
	rerender(<Stage detail="Hoodie" />);
	expect(mockBodyMounts).toBe(1);
	layOut();
	expect(mockBodyMounts).toBe(2);
	// Dealt in place (no tile to pin to), it keeps its first layout.
	rerender(<Stage detail={null} />);
	finish(0);
	mockBodyMounts = 0;
	rerender(<Stage detail="Tee" target={null} />);
	act(() => jest.advanceTimersByTime(120));
	expect(mockBodyMounts).toBe(1);
});
