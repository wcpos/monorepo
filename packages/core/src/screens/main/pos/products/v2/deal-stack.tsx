import * as React from 'react';
import { Platform, View, type ViewInstance, type ViewProps, type ViewStyle } from 'react-native';

import Animated, {
	cancelAnimation,
	ReduceMotion,
	type SharedValue,
	useAnimatedReaction,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withTiming,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import { scheduleOnRN } from 'react-native-worklets';

import { BEATS, EASE, EASE_BEAT, EASE_EXIT, PANE } from '@wcpos/components/lib/motion';

import { FIRST_FRAME_DELAY, fromFirstFrame } from './first-frame';

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
	/**
	 * The deal has had time to land every tile. Until then a cell that mounts (a cold level's
	 * answer filling more slots, a list rendering its next batch) joins the deal in the air
	 * rather than painting at rest among tiles still flying.
	 */
	landed: boolean;
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
	/** The detail on stage: a copy's report names the deal it was made for. */
	generation: number;
	/** The tile's `m-1` as the scale step draws it: a cell is the tile plus this on every side. */
	margin: number;
	/**
	 * The parent's copy reports to the stage: `false` as it mounts (it will say when it can be
	 * shown), then `true` once its first frame on the tapped tile has been applied on the UI
	 * thread and its picture has painted (`DealCell`).
	 */
	placeCopy: (asked: number, placed: boolean) => void;
	/** The copy may be shown, the tapped tile may step aside, and the deal may set off. */
	copyPlaced: boolean;
};

// The tile's `m-1` at the Regular step. The stage reads the live `--spacing` (`m-1` is one unit
// of it, and the scale step moves it): at 4 on a phone whose step drew 3.43 dp, every copy sat
// 1.5 px up and left of its tile and shifted at the handover (Pixel, 2026-10-07).
const TILE_MARGIN = 4;

// Outside a stage a cell is simply where it belongs.
const AT_REST: Deal = {
	origin: null,
	dealt: true,
	landed: true,
	stageWidth: 0,
	grid: null,
	placeGrid: () => {},
	generation: 0,
	margin: TILE_MARGIN,
	placeCopy: () => {},
	copyPlaced: true,
};
const DealContext = React.createContext<Deal>(AT_REST);

/** The detail on stage, for the root tile that has to step aside while its copy is out. */
export const DealStagedContext = React.createContext<unknown>(null);

export const useDeal = () => React.useContext(DealContext);

// A stack inside a detail that is cross-fading away: it holds what it shows until it goes.
const DealHeldContext = React.createContext(false);

// The parent and the tiles come from one frame; a variation fades in over the first of its travel.
const FADE_IN_BY = 0.8;
const SCALE_FROM = 0.92;
// How long the stage waits for the tile's frame and the pane's first layout before it deals
// in place. Both normally arrive within two frames; a tap must never be lost to a measurement.
const MEASURE_GRACE = 120;
// How long the copy waits for its picture to paint before it is shown anyway: a picture that
// never loads (offline, a deleted file) must not hold the deal. A cached picture paints within a
// frame or two of mounting.
const PICTURE_GRACE = 150;
// The whole deal, from the frame it sets off to the last tile landing: the parent's walk, or
// the capped stagger of the tiles and one landing, whichever is longer.
const DEAL_SPAN = Math.max(
	PANE,
	(BEATS.newTiles.cap - 1) * BEATS.newTiles.step + BEATS.newTiles.duration
);
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
	/**
	 * The detail leaves by cross-fading rather than gathering: it fades out where it stands while
	 * the root fades in, and the stacks inside it hold still. For a jump back of more than one
	 * level, where a gather would walk each level's parent home to a slot of ITS level, over
	 * tiles of this one, with every level ghosting over the others (web film, 2026-10-06).
	 */
	collapse?: boolean;
	testID?: string;
};

/**
 * The clocks a cross-fade leaves (the veil down, the furniture up, the products coming in) put
 * back at rest for the next detail: shown, its furniture still to fade in with its deal. Every
 * clock is cancelled BEFORE anything is read or set: a clock started on this very frame
 * (`withTiming(0)` not yet advanced) still reads its old value, and left running it would hide
 * the new detail and run its completion under it. Called only after a cross-fade was started
 * (`fadePending`), never after a gather, which leaves the veil up and runs the furniture home
 * itself.
 */
function restAfterCrossFade(
	veil: SharedValue<number>,
	furniture: SharedValue<number>,
	under: SharedValue<number>
): void {
	cancelAnimation(veil);
	cancelAnimation(furniture);
	cancelAnimation(under);
	veil.value = 1;
	furniture.value = 0;
}

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
	collapse = false,
	testID,
}: DealStackProps<T>) {
	const stage = React.useRef<ViewInstance>(null);
	const furniture = useSharedValue(0);
	// The products' own opacity. Going out they leave with the furniture's clock; coming back
	// they take the parent's whole walk, on an accelerating curve, so they are still dim while
	// the variations gather (the gaps between gathering tiles showed them at once, which
	// read as a flash) and reach full on the frame the parent lands (owner, 2026-10-05).
	const under = useSharedValue(1);
	// The detail's own opacity: 1 but while it cross-fades away.
	const veil = useSharedValue(1);
	const [stageWidth, setStageWidth] = React.useState(0);
	const spacing = Number.parseFloat(String(useCSSVariable('--spacing')));
	const margin = Number.isFinite(spacing) && spacing > 0 ? spacing : TILE_MARGIN;
	// The detail on stage outlives `detail` by one return, so its tiles can travel home.
	const [staged, setStaged] = React.useState<T | null>(null);
	const [generation, setGeneration] = React.useState(0);
	const [origin, setOrigin] = React.useState<Rect | null | undefined>(undefined);
	const [grid, setGrid] = React.useState<Rect | null | undefined>(undefined);
	// Whether the parent's copy stands on the tapped tile on the UI thread: `undefined` while no
	// copy has said it will report (a detail without one is shown as it is), `false` once it has,
	// `true` once it has.
	const [placed, setPlaced] = React.useState<boolean | undefined>(undefined);
	const [dealt, setDealt] = React.useState(false);
	const [settled, setSettled] = React.useState(false);
	// Not `settled`: that is the furniture's clock, which runs out long before the last tile lands.
	const [landed, setLanded] = React.useState(false);
	const [fading, setFading] = React.useState(false);
	// Inside a detail that is cross-fading away, a stack keeps what it has on stage: its detail
	// clears in the same render (the path was cut under it), and a gather would walk its parent
	// home inside a surface that is already leaving.
	const held = React.useContext(DealHeldContext);
	const shown = held && detail === null ? staged : detail;
	const open = shown !== null;
	if (open && shown !== staged) {
		setStaged(shown);
		setGeneration(generation + 1);
		setOrigin(undefined);
		setGrid(undefined);
		setPlaced(undefined);
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
	// The copy's word that it will report comes from its own layout effect in the commit that
	// mounts it, so it belongs to this staging (a stale copy has unmounted). Its word that it is
	// placed comes frames later, from the UI thread, and is dropped if another detail opened since.
	const placeCopy = React.useCallback((asked: number, ready: boolean) => {
		if (!ready) {
			setPlaced((known) => known ?? false);
			return;
		}
		if (current.current === asked) setPlaced(true);
	}, []);
	const copyPlaced = placed !== false;
	// A cross-fade is decided in the render that hears of the close, before any tile turns home.
	if (!open && collapse && staged !== null && !fading) setFading(true);
	if (open && fading) setFading(false);
	if (!open && settled) setSettled(false);
	if (!open && landed) setLanded(false);
	// The gather home waits for the stage's own frame after the commit that closes it. That commit
	// re-renders the level underneath (its products and footer under the parent's query), and on
	// Android mounting it blocked the UI thread for the frame the walk's clock started on: the
	// first painted frame of every walk home to the root was already 59% along (Pixel, 2026-10-07,
	// 1b f004 / 1d f003). As the copy does going out, the stage reports a UI frame after the commit
	// (`home`, below) and only then turns the tiles for home. The web's frames follow its commits.
	const web = Platform.OS === 'web';
	const [homeFor, setHomeFor] = React.useState(0);
	if (open && homeFor !== 0) setHomeFor(0);
	const homeward = web || homeFor === generation;
	// Closing turns the tiles for home once the stage is clear to; a cross-fade leaves them where
	// they stand.
	if (!open && dealt && !collapse && !fading && homeward) setDealt(false);
	// A leaving detail's clock (a gather's, a cross-fade's) clears the stage when it runs out —
	// only if the stage still holds the detail it was started for. A clock whose cancel came a
	// frame late (a tile opened on the first frame of a cross-fade) runs out under a NEWER
	// detail, and must never clear what it did not stage. After a cross-fade the tiles are put
	// back undealt for the next deal too.
	const clearedBy = React.useCallback((asked: number, afterFade: boolean) => {
		if (current.current !== asked) return;
		setStaged(null);
		if (afterFade) {
			setFading(false);
			setDealt(false);
		}
	}, []);
	// A cross-fade started and not yet put to rest for the next detail (see restAfterCrossFade).
	const fadePending = React.useRef(false);

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

	// Not before the copy is placed: the deal's first frame moves it off the tapped tile.
	const armed = origin !== undefined && grid !== undefined && copyPlaced;
	React.useEffect(() => {
		// The staging this clock is started for: its completion clears the stage only for it.
		const asked = current.current;
		if (!open && fading) {
			// Out where it stands, and the root in over it, on one clock: nothing travels. A frame
			// later, as the deal sets off: the cut that sent it is a heavy commit, and a clock started
			// under it had spent half the fade before its first frame painted (web film, 2026-10-06).
			fadePending.current = true;
			const frame = requestAnimationFrame(() => {
				veil.value = fromFirstFrame(
					withTiming(0, { duration: PANE, easing: EASE, ...REDUCE }, (finished) => {
						'worklet';
						if (finished) scheduleOnRN(clearedBy, asked, true);
					})
				);
				under.value = fromFirstFrame(withTiming(1, { duration: PANE, easing: EASE, ...REDUCE }));
			});
			return () => cancelAnimationFrame(frame);
		}
		if (!open) {
			if (!homeward) return;
			// The products and the parent share one clock: the detail leaves the stage on the frame
			// the parent tile reaches home, and the breadcrumb is gone before it passes underneath.
			furniture.value = fromFirstFrame(
				withTiming(0, { duration: PANE, easing: EASE, ...REDUCE }, (finished) => {
					'worklet';
					if (finished) scheduleOnRN(clearedBy, asked, false);
				})
			);
			under.value = fromFirstFrame(withTiming(1, { duration: PANE, easing: EASE_EXIT, ...REDUCE }));
			return;
		}
		// A tap during the return keeps the stage: the return's clock would otherwise clear the
		// detail when it ran out, taking the new tile's measurement with it.
		cancelAnimation(furniture);
		cancelAnimation(under);
		// So does a tap during a cross-fade: the new detail is shown whole (its veil was put back
		// up before its first paint, above).
		if (!armed) return;
		// A frame later, so the tiles' first paint (stacked on the tapped tile) is not also
		// their first move.
		let landing: ReturnType<typeof setTimeout> | undefined;
		const frame = requestAnimationFrame(() => {
			setDealt(true);
			landing = setTimeout(() => setLanded(true), DEAL_SPAN);
			furniture.value = fromFirstFrame(
				withTiming(
					1,
					{ duration: BEATS.oldTiles.duration, easing: EASE, ...REDUCE },
					(finished) => {
						'worklet';
						if (finished) scheduleOnRN(setSettled, true);
					}
				)
			);
			under.value = fromFirstFrame(
				withTiming(0, { duration: BEATS.oldTiles.duration, easing: EASE, ...REDUCE })
			);
		});
		return () => {
			cancelAnimationFrame(frame);
			clearTimeout(landing);
		};
	}, [open, armed, fading, homeward, clearedBy, furniture, under, veil]);
	// The closing commit's own frame: written as the commit lands, run on the UI thread after it
	// has mounted, and reported a frame later — the frame the walk home then starts on.
	const home = useSharedValue(0);
	React.useLayoutEffect(() => {
		home.value = !open && staged !== null && !web ? generation : 0;
	}, [home, open, staged, web, generation]);
	useAnimatedReaction(
		() => home.value,
		(asked, was) => {
			if (asked === 0 || asked === was) return;
			requestAnimationFrame(() => scheduleOnRN(setHomeFor, asked));
		}
	);

	// A detail put on stage after (or during) a cross-fade starts every opacity clock from rest,
	// before its first paint. A gather runs the furniture home to 0 and leaves the veil up; a
	// cross-fade leaves the veil down and the furniture up — the new detail would mount hidden,
	// then snap in a frame later, with its crumb and footer there whole instead of joining its
	// deal. A layout effect, on the staging itself: `origin` and `grid` are reset the same way, in
	// the render that stages it. On the fact that a fade was started, never on what its clock
	// reads: on the fade's first frame the veil still reads 1.
	React.useLayoutEffect(() => {
		if (!open || !fadePending.current) return;
		fadePending.current = false;
		restAfterCrossFade(veil, furniture, under);
	}, [open, generation, furniture, under, veil]);

	const deal = React.useMemo<Deal>(
		() => ({
			origin,
			dealt,
			landed,
			stageWidth,
			grid,
			placeGrid,
			furniture,
			generation,
			margin,
			placeCopy,
			copyPlaced,
		}),
		[
			origin,
			dealt,
			landed,
			stageWidth,
			grid,
			placeGrid,
			furniture,
			generation,
			margin,
			placeCopy,
			copyPlaced,
		]
	);

	// Clamped for the reason `PaneStack` clamps: a first frame stamped before the animation's
	// start asks the easing for a negative time.
	const rootStyle = useAnimatedStyle(() => ({
		opacity: Math.min(1, Math.max(0, under.value)),
	}));
	const veilStyle = useAnimatedStyle(() => ({
		opacity: Math.min(1, Math.max(0, veil.value)),
	}));

	return (
		<View
			ref={stage}
			className="flex-1 overflow-hidden"
			testID={testID}
			onLayout={(event) => setStageWidth(event.nativeEvent.layout.width)}
		>
			{/* The tapped tile steps aside only once its copy stands on it — the copy needs the
			    grid's frame as well as the tile's, and on Android the two arrive frames apart:
			    lifting on the tile's frame alone left the slot empty for two frames (Pixel,
			    2026-10-05; then the crumb's height, now the grid's own measured frame) — and only
			    once the copy's own first frame is on the UI thread (`copyPlaced`, see DealCell).
			    In a cross-fade no copy comes home, so the tile is back in the root that fades in. */}
			<DealStagedContext.Provider
				value={origin && grid !== undefined && copyPlaced && !fading ? staged : null}
			>
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
						<DealHeldContext.Provider value={held || fading}>
							<Animated.View className="flex-1" style={veilStyle}>
								{renderDetail(staged)}
							</Animated.View>
						</DealHeldContext.Provider>
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
 * A slot's resting place is within the grid's measured frame: its column, and its row's top.
 * The row's top is measured when the grid gives it (`restY`); otherwise it is arithmetic on the
 * tapped tile's height, which holds while every row is that tall. Only slot 0 has to start
 * exactly on the tapped tile, and its place is exact because the frame is measured, not assumed
 * to be the stage.
 */
export function DealCell({
	index,
	count,
	columns,
	scroll,
	restY,
	children,
}: {
	index: number;
	/** How many slots the grid has, the parent included. */
	count: number;
	columns: number;
	/** The grid's scroll offset: a scrolled grid gathers from where its tiles are on screen. */
	scroll?: SharedValue<number>;
	/**
	 * The top of this slot's row within the grid's frame, unscrolled, where the grid measured it.
	 * A grid whose rows differ in height (term tiles above taller product tiles) gives it, so a
	 * cell below a taller row starts under the parent rather than a row's difference away.
	 */
	restY?: number;
	children: React.ReactNode;
}) {
	const { origin, dealt, landed, stageWidth, grid, generation, margin, placeCopy, copyPlaced } =
		useDeal();
	// A cell that mounts while the deal is still in the air (more slots than the placeholders
	// held, the list's next batch) starts under the parent, unseen, and is dealt from there, so it
	// is not painted at rest while the first row still flies. One that mounts after the deal has
	// landed is simply where it belongs: nothing animates on mount.
	const atRest = dealt && landed;
	const travel = useSharedValue(atRest ? 1 : 0);
	const parent = index === 0;

	// A cell sets off only when its direction changes. `count` moves while a cold query fills
	// its placeholders; a tile already in the air must not stop for a fresh delay.
	const aimed = React.useRef(atRest);
	// Joining late, its turn in the stagger has already come: it sets off at once.
	const late = React.useRef(dealt && !landed);
	React.useEffect(() => {
		if (aimed.current === dealt) return;
		aimed.current = dealt;
		if (parent) {
			travel.value = fromFirstFrame(
				withTiming(dealt ? 1 : 0, { duration: PANE, easing: EASE, ...REDUCE })
			);
			return;
		}
		// Out: in order, each landing on the beat. Back: last out is first home, speeding up
		// into the parent rather than creeping onto it. The beat counts from the first painted
		// frame, as the parent's walk does: a delay of 0 would start the first tile's clock on
		// receipt, so on a heavy commit it painted mid-flight beside a parent still at its origin
		// (Codex on #2420).
		const turn = dealt ? (late.current ? 0 : index - 1) : count - 1 - index;
		late.current = false;
		const beat = dealt ? BEATS.newTiles : BEATS.oldTiles;
		travel.value = withDelay(
			FIRST_FRAME_DELAY + Math.min(turn, beat.cap - 1) * beat.step,
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
		? origin.x - (frame.x + (index % columns) * (frame.width / columns) + margin)
		: 0;
	const rowTop = flies ? (restY ?? Math.floor(index / columns) * (origin.height + 2 * margin)) : 0;
	const fromY = flies ? origin.y - (frame.y + rowTop + margin) : 0;
	// Hidden until BOTH the tile's frame and the grid's frame are known: the offset needs both,
	// and on Android the two measurements answer frames apart, so a cell that waited for the
	// tile's frame alone painted at rest for a few frames and then snapped onto the tapped tile
	// (Pixel, 2026-10-05, when the second was the crumb's height). The stage arms on the same pair.
	const waiting = origin === undefined || grid === undefined;
	// Pictures on the copy that have not painted yet (`useCopyPicture`).
	const [pictures, setPictures] = React.useState(0);
	// `ready`: the offset is the one the copy is first shown at (the frames are known), and the
	// copy's pictures have painted.
	const ready = !waiting && pictures === 0;
	// The offset is a shared value written as the commit lands, not a value the worklet closes
	// over. A closed-over value reaches the view only when the style's mapper restarts: on web
	// in a passive effect, then the next animation frame. When a heavy commit (a term level's
	// list) yields to the browser before its passive effects run, the frame that dropped UNSEEN
	// painted the parent at its own slot, and it snapped onto the tapped tile a frame later (web
	// film, 2026-10-06). Written in a layout effect, the mapper reruns in that commit's
	// microtask, before the paint.
	const offset = useSharedValue({ x: fromX, y: fromY, flies, ready });
	React.useLayoutEffect(() => {
		offset.value = { x: fromX, y: fromY, flies, ready };
	}, [offset, fromX, fromY, flies, ready]);

	// The copy is shown, and the tapped tile steps aside, in one React commit — and on Android a
	// React commit carries the props the UI thread has already applied, not the ones a shared value
	// written in that same commit will produce a frame later. Shown on the commit that knew the
	// frames, the copy painted for a frame at its own slot, at rest, before its offset reached it
	// (Pixel, 2026-10-06: Tops cold f004, Hoodie f004). So the copy says it will report as it
	// mounts, and is shown only once the UI thread has run its style with the offset — a frame
	// after the reaction that sees it — and once its picture has painted (`useCopyPicture`).
	React.useLayoutEffect(() => {
		if (parent) placeCopy(generation, false);
	}, [parent, placeCopy, generation]);
	// The web has no such frame: the style's mapper reruns in this commit's microtask, before the
	// paint (above), so the copy reports in the commit that knows its frames — waiting a frame
	// there only made every deal start later.
	const web = Platform.OS === 'web';
	React.useLayoutEffect(() => {
		if (parent && web && ready) placeCopy(generation, true);
	}, [parent, web, ready, placeCopy, generation]);
	useAnimatedReaction(
		() => parent && !web && offset.value.ready,
		(placed, was) => {
			if (!placed || was) return;
			requestAnimationFrame(() => scheduleOnRN(placeCopy, generation, true));
		},
		[parent, web, placeCopy, generation]
	);
	const holdPicture = React.useCallback(() => {
		let held = true;
		setPictures((pending) => pending + 1);
		const release = () => {
			if (!held) return;
			held = false;
			clearTimeout(grace);
			setPictures((pending) => pending - 1);
		};
		const grace = setTimeout(release, PICTURE_GRACE);
		return release;
	}, []);

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

	// The copy IS the tapped tile, at its size, from the frame it appears to the frame it lands
	// home: its row in the level may be taller (a product tile beside it), and a cold level's
	// answer replaced the placeholders with taller tiles while the copy stood on the tapped tile,
	// so it grew 244 → 431 px in one frame (Pixel, 2026-10-06, Clothing › Men f009) — and walked
	// home taller than the tile it lands on.
	const size =
		parent && flies
			? {
					// The tapped tile's width too: a column of the level is a fraction of a dp off the
					// root's, and a name that breaks mid-word broke one letter earlier on the copy
					// ("Uncategor / ized" against "Uncatego / rized", Pixel, 2026-10-07). A fixed
					// width, not a share of the row — and no `flex` shorthand anywhere on it (the
					// cell drops its `flex-1` class below): beside `flex: 1` Yoga reads an `auto`
					// basis as 0 and collapsed the copy on the phone, and a `flex: 0` instead is
					// `0 1 0%` in CSS, whose 0% basis beats the width and collapsed it on the web.
					width: origin.width + 2 * margin,
					height: origin.height + 2 * margin,
					flexGrow: 0,
					flexShrink: 0,
					flexBasis: 'auto' as const,
				}
			: null;

	return (
		<Animated.View
			className={size ? undefined : 'flex-1'}
			style={[style, parent && FRONT, size, parent && (waiting || !copyPlaced) && UNSEEN]}
		>
			{parent ? (
				<CopyPictureContext.Provider value={holdPicture}>
					{/* Laid out afresh at the pinned box: the copy mounts (unseen) in the level's column
					    before the tapped tile is measured, and on Android its words kept the frames of
					    that first layout when the box was pinned — the name broke a letter early
					    ("Uncatego / rized" in a box that holds "Uncategor", Pixel, 2026-10-07). */}
					<React.Fragment key={size ? 'pinned' : 'free'}>{children}</React.Fragment>
				</CopyPictureContext.Provider>
			) : (
				children
			)}
		</Animated.View>
	);
}

// The parent's copy, to a picture on it: hold the copy unseen until you have painted.
const CopyPictureContext = React.createContext<(() => () => void) | null>(null);

/**
 * For a picture on the parent tile: the copy is not shown until the picture has painted — it
 * appeared with a blank square for a frame, the picture decoding after the copy mounted (Pixel,
 * 2026-10-06, Hoodie f004). Returns the image's `onDisplay` / `onError` handler, which lets the
 * copy go; outside a copy it is `undefined`. A picture that never paints is waited for only
 * `PICTURE_GRACE`.
 */
export function useCopyPicture(): (() => void) | undefined {
	// Native only: the web paints a cached picture as it mounts (the web film showed no blank
	// square), and its `onDisplay` fires a frame after the load — a hold there was only latency.
	const held = React.useContext(CopyPictureContext);
	const hold = Platform.OS === 'web' ? null : held;
	const release = React.useRef<(() => void) | null>(null);
	React.useLayoutEffect(() => {
		if (!hold) return;
		const done = hold();
		release.current = done;
		return () => {
			release.current = null;
			done();
		};
	}, [hold]);
	const painted = React.useCallback(() => release.current?.(), []);
	return hold ? painted : undefined;
}

/** The parent, and the row it sits in, stay above the tiles that come out from under it. */
export const FRONT = { zIndex: 1 };
// The parent before it can stand on the tapped tile. A plain style, not a worklet prop: it
// has to commit on the same frame as the tapped tile stepping aside.
const UNSEEN = { opacity: 0 };

const NO_AIR: { frame?: ViewStyle; scroller?: ViewStyle } = {};
const VISIBLE: ViewStyle = { overflow: 'visible' };

/**
 * The air above a dealt grid, for the tiles in flight. The grid's scroller clips what it holds,
 * and a tile tapped in the products' first row sits where the level's crumb row is: its copy set
 * off with its top ~92 px — the tile's name — cut away by the scroller's edge, and walked home
 * the same way (Pixel, 2026-10-06: Clothing warm f004–f008, return f006–f016). While a deal or a
 * gather is in the air over a grid at its top, the scroller lets its tiles out, and a frame
 * around it (`frame`, reaching up to the stage's top) clips them at its bottom instead, so no row
 * below shows over the footer. A grid scrolled away from its top keeps its own edge: rows above
 * it would show over the crumb. Both styles are empty at rest.
 */
export function useAirspace(scroll: SharedValue<number>): {
	frame?: ViewStyle;
	scroller?: ViewStyle;
} {
	const { landed, grid } = useDeal();
	const [atTop, setAtTop] = React.useState(true);
	useAnimatedReaction(
		() => scroll.value <= 0,
		(top, was) => {
			if (top !== was) scheduleOnRN(setAtTop, top);
		}
	);
	// Native only: a web scroller made `overflow: visible` stops being one and loses its offset.
	if (Platform.OS === 'web' || landed || !atTop || !grid) return NO_AIR;
	return {
		// `box-none`: the frame reaches over the crumb row, whose presses must still land on it.
		frame: {
			marginTop: -grid.y,
			paddingTop: grid.y,
			overflow: 'hidden',
			pointerEvents: 'box-none',
		},
		scroller: VISIBLE,
	};
}

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
