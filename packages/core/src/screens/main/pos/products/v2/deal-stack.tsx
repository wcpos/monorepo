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
	/** How far down the stage the grid's first row starts (the breadcrumb's height). */
	top: number | null;
	setTop: (top: number) => void;
	furniture?: SharedValue<number>;
};

// Outside a stage a cell is simply where it belongs.
const AT_REST: Deal = {
	origin: null,
	dealt: true,
	stageWidth: 0,
	top: 0,
	setTop: () => {},
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
	const [top, setTop] = React.useState<number | null>(null);
	const [dealt, setDealt] = React.useState(false);
	const [settled, setSettled] = React.useState(false);
	const open = detail !== null;
	if (open && detail !== staged) {
		setStaged(detail);
		setGeneration(generation + 1);
		setOrigin(undefined);
		setTop(null);
		setDealt(false);
	}
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
			setTop((known) => known ?? 0);
		}, MEASURE_GRACE);
		return () => {
			live = false;
			clearTimeout(grace);
		};
	}, [detail, target]);

	const armed = origin !== undefined && top !== null;
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
			top,
			setTop,
			furniture,
		}),
		[origin, dealt, stageWidth, top, furniture]
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
			<DealStagedContext.Provider value={origin ? staged : null}>
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
 * A slot's resting place is arithmetic (column, row, the tapped tile's height), not a
 * measurement: only slot 0 has to start exactly on the tapped tile, and its place is exact.
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
	const { origin, dealt, stageWidth, top } = useDeal();
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

	const flies = !!origin && top !== null;
	const fromX = flies ? origin.x - ((index % columns) * (stageWidth / columns) + TILE_MARGIN) : 0;
	const fromY = flies
		? origin.y -
			(top + Math.floor(index / columns) * (origin.height + 2 * TILE_MARGIN) + TILE_MARGIN)
		: 0;
	const waiting = origin === undefined;

	const style = useAnimatedStyle(() => {
		const left = 1 - travel.value;
		const translate = [
			{ translateX: fromX * left },
			{ translateY: (flies ? fromY + (scroll?.value ?? 0) : 0) * left },
		];
		if (parent) return { opacity: waiting ? 0 : 1, transform: translate };
		return {
			opacity: Math.min(1, Math.max(0, travel.value / FADE_IN_BY)),
			transform: [...translate, { scale: SCALE_FROM + (1 - SCALE_FROM) * travel.value }],
		};
	});

	return (
		<Animated.View className="flex-1" style={[style, parent && FRONT]}>
			{children}
		</Animated.View>
	);
}

/** The parent, and the row it sits in, stay above the tiles that come out from under it. */
export const FRONT = { zIndex: 1 };

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
