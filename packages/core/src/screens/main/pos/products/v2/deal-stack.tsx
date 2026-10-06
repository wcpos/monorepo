import * as React from 'react';
import { Platform, View, type ViewInstance, type ViewProps } from 'react-native';

import Animated, {
	cancelAnimation,
	ReduceMotion,
	type SharedValue,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { BEATS, EASE, EASE_BEAT, EASE_EXIT, PANE } from '@wcpos/components/lib/motion';

type Rect = { x: number; y: number; width: number; height: number };

/** Anything that can report its frame in the window: a tile's `Pressable`, the stage's `View`. */
export type Measurable = {
	measureInWindow?: (
		callback: (x: number, y: number, width: number, height: number) => void
	) => void;
} | null;

type Deal = {
	/** The tapped tile's frame within the stage: `undefined` while it is measured, `null` if it could not be. */
	origin: Rect | null | undefined;
	/** Where the tiles are headed: out on the grid, or back in the parent. */
	dealt: boolean;
	stageWidth: number;
	/**
	 * The dealt grid's frame within the stage, where its slots rest: `undefined` until the grid
	 * has reported it, `null` if it could not be measured (the slots then rest on the stage
	 * itself). Measured, not assumed: the grid sits on a card inset from the stage, under a
	 * breadcrumb, and the parent must land exactly on the tapped tile whatever frames them.
	 */
	grid: Rect | null | undefined;
	/** The dealt grid reports the node its slots are laid out in; the stage places it against itself. */
	placeGrid: (node: Measurable) => void;
	furniture?: SharedValue<number>;
};

// Outside a stage a cell is simply where it belongs.
const AT_REST: Deal = {
	origin: null,
	dealt: true,
	stageWidth: 0,
	grid: null,
	placeGrid: () => {},
};
const DealContext = React.createContext<Deal>(AT_REST);

/** The detail on stage, for the root tile that has to step aside while its copy is out. */
export const DealStagedContext = React.createContext<unknown>(null);

export const useDeal = () => React.useContext(DealContext);

// The tile's `m-1`: a cell is the tile plus this much on every side.
const TILE_MARGIN = 4;
// The parent and the tiles come from one frame; a variation fades in over the first of its travel.
const FADE_IN_BY = 0.8;
const SCALE_FROM = 0.92;
// How long the stage waits for the tile's frame and the pane's first layout before it deals
// in place. Both normally arrive within two frames; a tap must never be lost to a measurement.
const MEASURE_GRACE = 120;
const REDUCE = { reduceMotion: ReduceMotion.System };

// Web only: covered products leave the tab order and the accessibility tree but keep their
// layout, so the grid is still scrolled to the same row when it comes back.
const COVERED = Platform.OS === 'web' ? ({ visibility: 'hidden' } as object) : null;

export type DealStackProps<T> = {
	/** What is drilled into; `null` shows the root grid. */
	detail: T | null;
	/** The tile that was tapped. Its frame is where the deal starts and where it returns. */
	target?: Measurable;
	renderDetail: (detail: T) => React.ReactNode;
	/** The root grid. It stays mounted underneath the detail. */
	children: React.ReactNode;
	testID?: string;
};

/**
 * A grid of tiles and the grid of one tile's children, on one stage (owner's pick,
 * 2026-10-02). The tapped tile walks to the first slot and its children are dealt out from
 * under it; going back gathers them into the tile, which walks home.
 *
 * Both grids stay mounted for the whole transition. Only `transform` and `opacity` animate,
 * and nothing animates on mount: the detail is laid out invisibly, and the deal starts on the
 * frame after the tile's frame and the pane's own layout are both known.
 */
export function DealStack<T>({
	detail,
	target,
	renderDetail,
	children,
	testID,
}: DealStackProps<T>) {
	const stage = React.useRef<ViewInstance>(null);
	const furniture = useSharedValue(0);
	// The products' own opacity. Going out they leave with the furniture's clock; coming back
	// they take the parent's whole walk, on an accelerating curve, so they are still dim while
	// the variations gather (the gaps between gathering tiles showed them at once, which
	// read as a flash) and reach full on the frame the parent lands (owner, 2026-10-05).
	const under = useSharedValue(1);
	const [stageWidth, setStageWidth] = React.useState(0);
	// The detail on stage outlives `detail` by one return, so its tiles can travel home.
	const [staged, setStaged] = React.useState<T | null>(null);
	const [generation, setGeneration] = React.useState(0);
	const [origin, setOrigin] = React.useState<Rect | null | undefined>(undefined);
	const [grid, setGrid] = React.useState<Rect | null | undefined>(undefined);
	const [dealt, setDealt] = React.useState(false);
	const [settled, setSettled] = React.useState(false);
	const open = detail !== null;
	if (open && detail !== staged) {
		setStaged(detail);
		setGeneration(generation + 1);
		setOrigin(undefined);
		setGrid(undefined);
		setDealt(false);
	}

	// The grid's frame, like the tile's: both in the window, so the stage's own frame is taken off.
	// A measurement belongs to the deal that asked for it: one that lands after the cashier has
	// opened another detail would overwrite the new grid's frame (CodeRabbit on #2396).
	const current = React.useRef(generation);
	React.useLayoutEffect(() => {
		current.current = generation;
	}, [generation]);
	const placeGrid = React.useCallback((node: Measurable) => {
		const frame = stage.current as Measurable;
		if (!node?.measureInWindow || !frame?.measureInWindow) return;
		const asked = current.current;
		node.measureInWindow((x, y, width, height) =>
			frame.measureInWindow?.((stageX, stageY) => {
				if (current.current !== asked) return;
				// Once the grace period has dealt in place (`null`), that is this deal's frame: an
				// answer arriving mid-flight would move every cell's offset under it (CodeRabbit on
				// #2396). The next deal measures afresh.
				setGrid((known) =>
					known === null ? known : { x: x - stageX, y: y - stageY, width, height }
				);
			})
		);
	}, []);
	if (!open && settled) setSettled(false);
	// Closing turns the tiles for home in the same render that hears of it.
	if (!open && dealt) setDealt(false);

	// What had focus when the tile was tapped (the tile) gets it back when the parent walks
	// home, if the control that sent it home was inside the dealt grid, which is leaving. Focus
	// that has moved somewhere live (a search field whose typing closed the deal) is left alone.
	// A layout effect: the detail mounts in the same commit, and its breadcrumb takes focus in a
	// passive effect, which would otherwise be the "opener" on record.
	const opener = React.useRef<HTMLElement | null>(null);
	const leaving = React.useRef<ViewInstance>(null);
	React.useLayoutEffect(() => {
		if (typeof document === 'undefined') return;
		if (open) {
			opener.current = document.activeElement as HTMLElement | null;
			return;
		}
		const active = document.activeElement;
		const grid = leaving.current as unknown as HTMLElement | null;
		const stranded = !active || active === document.body || !!grid?.contains?.(active);
		if (stranded && opener.current?.isConnected) opener.current.focus({ preventScroll: true });
		opener.current = null;
	}, [open]);

	React.useEffect(() => {
		if (detail === null) return;
		let live = true;
		const tile = target;
		const frame = stage.current as Measurable;
		if (tile?.measureInWindow && frame?.measureInWindow) {
			tile.measureInWindow((x, y, width, height) =>
				frame.measureInWindow?.((stageX, stageY) => {
					if (live) setOrigin({ x: x - stageX, y: y - stageY, width, height });
				})
			);
		}
		const grace = setTimeout(() => {
			setOrigin((known) => (known === undefined ? null : known));
			setGrid((known) => (known === undefined ? null : known));
		}, MEASURE_GRACE);
		return () => {
			live = false;
			clearTimeout(grace);
		};
	}, [detail, target]);

	const armed = origin !== undefined && grid !== undefined;
	React.useEffect(() => {
		if (!open) {
			// The products and the parent share one clock: the detail leaves the stage on the frame
			// the parent tile reaches home, and the breadcrumb is gone before it passes underneath.
			furniture.value = withTiming(0, { duration: PANE, easing: EASE, ...REDUCE }, (finished) => {
				'worklet';
				if (finished) scheduleOnRN(setStaged, null);
			});
			under.value = withTiming(1, { duration: PANE, easing: EASE_EXIT, ...REDUCE });
			return;
		}
		// A tap during the return keeps the stage: the return's clock would otherwise clear the
		// detail when it ran out, taking the new tile's measurement with it.
		cancelAnimation(furniture);
		cancelAnimation(under);
		if (!armed) return;
		// A frame later, so the tiles' first paint (stacked on the tapped tile) is not also
		// their first move.
		const frame = requestAnimationFrame(() => {
			setDealt(true);
			furniture.value = withTiming(
				1,
				{ duration: BEATS.oldTiles.duration, easing: EASE, ...REDUCE },
				(finished) => {
					'worklet';
					if (finished) scheduleOnRN(setSettled, true);
				}
			);
			under.value = withTiming(0, { duration: BEATS.oldTiles.duration, easing: EASE, ...REDUCE });
		});
		return () => cancelAnimationFrame(frame);
	}, [open, armed, furniture, under]);

	const deal = React.useMemo<Deal>(
		() => ({
			origin,
			dealt,
			stageWidth,
			grid,
			placeGrid,
			furniture,
		}),
		[origin, dealt, stageWidth, grid, placeGrid, furniture]
	);

	// Clamped for the reason `PaneStack` clamps: a first frame stamped before the animation's
	// start asks the easing for a negative time.
	const rootStyle = useAnimatedStyle(() => ({
		opacity: Math.min(1, Math.max(0, under.value)),
	}));

	return (
		<View
			ref={stage}
			className="flex-1 overflow-hidden"
			testID={testID}
			onLayout={(event) => setStageWidth(event.nativeEvent.layout.width)}
		>
			{/* The tapped tile steps aside only once its copy can stand on it — the copy needs the
			    grid's frame as well as the tile's, and on Android the two arrive frames apart:
			    lifting on the tile's frame alone left the slot empty for two frames (Pixel,
			    2026-10-05; then the crumb's height, now the grid's own measured frame). */}
			<DealStagedContext.Provider value={origin && grid !== undefined ? staged : null}>
				<Animated.View
					className="flex-1"
					aria-hidden={open}
					style={[rootStyle, { pointerEvents: open ? 'none' : 'auto' }, open && settled && COVERED]}
				>
					{children}
				</Animated.View>
			</DealStagedContext.Provider>
			{staged !== null && (
				<DealContext.Provider value={deal}>
					<View
						key={generation}
						ref={leaving}
						className="absolute inset-0"
						// A grid that is gathering is already gone to a screen reader.
						aria-hidden={!open}
						style={{ pointerEvents: open ? 'auto' : 'none' }}
					>
						{renderDetail(staged)}
					</View>
				</DealContext.Provider>
			)}
		</View>
	);
}

/**
 * One slot of the dealt grid. Slot 0 is the parent tile, which travels from the tapped
 * tile's frame; every other slot starts underneath it and lands in turn.
 *
 * A slot's resting place is arithmetic within the grid's measured frame (column, row, the
 * tapped tile's height): only slot 0 has to start exactly on the tapped tile, and its place is
 * exact because the frame is measured, not assumed to be the stage.
 */
export function DealCell({
	index,
	count,
	columns,
	scroll,
	children,
}: {
	index: number;
	/** How many slots the grid has, the parent included. */
	count: number;
	columns: number;
	/** The grid's scroll offset: a scrolled grid gathers from where its tiles are on screen. */
	scroll?: SharedValue<number>;
	children: React.ReactNode;
}) {
	const { origin, dealt, stageWidth, grid } = useDeal();
	const travel = useSharedValue(dealt ? 1 : 0);
	const parent = index === 0;

	// A cell sets off only when its direction changes. `count` moves while a cold query fills
	// its placeholders; a tile already in the air must not stop for a fresh delay.
	const aimed = React.useRef(dealt);
	React.useEffect(() => {
		if (aimed.current === dealt) return;
		aimed.current = dealt;
		if (parent) {
			travel.value = withTiming(dealt ? 1 : 0, { duration: PANE, easing: EASE, ...REDUCE });
			return;
		}
		// Out: in order, each landing on the beat. Back: last out is first home, speeding up
		// into the parent rather than creeping onto it.
		const turn = dealt ? index - 1 : count - 1 - index;
		const beat = dealt ? BEATS.newTiles : BEATS.oldTiles;
		travel.value = withDelay(
			Math.min(turn, beat.cap - 1) * beat.step,
			withTiming(dealt ? 1 : 0, {
				duration: beat.duration,
				easing: dealt ? EASE_BEAT : EASE_EXIT,
				...REDUCE,
			})
		);
	}, [dealt, parent, index, count, travel]);

	const flies = !!origin && grid !== undefined;
	// An unmeasured grid rests on the stage itself, as it did before it had a card.
	const frame = grid ?? { x: 0, y: 0, width: stageWidth };
	const fromX = flies
		? origin.x - (frame.x + (index % columns) * (frame.width / columns) + TILE_MARGIN)
		: 0;
	const fromY = flies
		? origin.y -
			(frame.y + Math.floor(index / columns) * (origin.height + 2 * TILE_MARGIN) + TILE_MARGIN)
		: 0;
	// Hidden until BOTH the tile's frame and the grid's frame are known: the offset needs both,
	// and on Android the two measurements answer frames apart, so a cell that waited for the
	// tile's frame alone painted at rest for a few frames and then snapped onto the tapped tile
	// (Pixel, 2026-10-05, when the second was the crumb's height). The stage arms on the same pair.
	const waiting = origin === undefined || grid === undefined;
	// The offset is a shared value written as the commit lands, not a value the worklet closes
	// over. A closed-over value reaches the view only when the style's mapper restarts: on web
	// in a passive effect, then the next animation frame. When a heavy commit (a term level's
	// list) yields to the browser before its passive effects run, the frame that dropped UNSEEN
	// painted the parent at its own slot, and it snapped onto the tapped tile a frame later (web
	// film, 2026-10-06). Written in a layout effect, the mapper reruns in that commit's
	// microtask, before the paint.
	const offset = useSharedValue({ x: fromX, y: fromY, flies });
	React.useLayoutEffect(() => {
		offset.value = { x: fromX, y: fromY, flies };
	}, [offset, fromX, fromY, flies]);

	const style = useAnimatedStyle(() => {
		// Clamped for the reason the stage clamps: a first frame stamped before the animation's
		// start asks the easing for a negative time, and the curve extrapolates past 0 or 1. On
		// the way home that put the parent a tile's width LEFT of the screen for two frames
		// (Pixel, 2026-10-05) — `1 - travel` went negative.
		const t = Math.min(1, Math.max(0, travel.value));
		const left = 1 - t;
		const from = offset.value;
		const translate = [
			{ translateX: from.x * left },
			{ translateY: (from.flies ? from.y + (scroll?.value ?? 0) : 0) * left },
		];
		// The parent's visibility is NOT in here: a worklet's props land on the UI thread a frame after
		// the commit on Android, and the tapped tile steps aside at the commit, so the slot was empty
		// for a frame (Pixel, 2026-10-05). It is a plain style below, committed with the lift.
		if (parent) return { transform: translate };
		return {
			opacity: Math.min(1, t / FADE_IN_BY),
			transform: [...translate, { scale: SCALE_FROM + (1 - SCALE_FROM) * t }],
		};
	});

	return (
		<Animated.View className="flex-1" style={[style, parent && FRONT, parent && waiting && UNSEEN]}>
			{children}
		</Animated.View>
	);
}

/** The parent, and the row it sits in, stay above the tiles that come out from under it. */
export const FRONT = { zIndex: 1 };
// The parent before it can stand on the tapped tile. A plain style, not a worklet prop: it
// has to commit on the same frame as the tapped tile stepping aside.
const UNSEEN = { opacity: 0 };

/** The pane's furniture (breadcrumb, footer): it fades in as the products fade out. */
export function DealFade({ children, style, ...props }: ViewProps) {
	const { furniture } = useDeal();
	const fade = useAnimatedStyle(() => ({
		opacity: furniture ? Math.min(1, Math.max(0, furniture.value)) : 1,
	}));
	return (
		<Animated.View {...props} style={[style, fade]}>
			{children}
		</Animated.View>
	);
}
