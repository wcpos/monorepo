import * as React from 'react';
import type { LayoutChangeEvent } from 'react-native';

import Animated, {
	cancelAnimation,
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withSequence,
	withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { EASE, EASE_EXIT, PANEL_SLIDE_OUT } from '../lib/motion';
import { cn } from '../lib/utils';

import type { RowData, TableFeatures } from '@tanstack/react-table';
import type { Row, Table } from '../data-table/types';

type PulseTableRowProps<
	TData extends RowData,
	TFeatures extends TableFeatures,
> = React.ComponentPropsWithoutRef<typeof Animated.View> & {
	onRemove?: () => void;
	index?: number;
	row: Row<TData, TFeatures>;
	table: Table<TData, TFeatures>;
	ref?: React.Ref<PulseTableRowRef>;
};

/**
 * `pulseRemove`'s completion callback. It may return a promise — the row uses it
 * to know when the mutation it committed has settled — and it owns reporting its
 * own failures: a rejection is passed through, never swallowed here.
 */
type PulseRemoveCallback = () => void | Promise<unknown>;

interface PulseTableRowRef {
	pulseAdd: (callback?: () => void) => void;
	/**
	 * The removal tint without the removal: the cart line turns it on when a swipe crosses
	 * the remove point and off again when the finger comes back, so the row is already red
	 * when `pulseRemove` lands. Ignored while a removal is committing.
	 */
	armRemove: (on: boolean) => void;
	pulseRemove: (callback?: PulseRemoveCallback) => void;
}

// The added line lights up at once and settles back: a flash that answers the tap, then a
// slow release (540 ms in all, where 400 + 400 read as a row slowly changing colour).
const LIT = { duration: 120, easing: EASE };
const SETTLE = { duration: 420, easing: EASE };
// The removal waits on this pulse, so it is short: nothing over 400 ms on a path the cashier
// is waiting on. A row the swipe already armed is at full tint and this finishes at once.
const GOING = { duration: PANEL_SLIDE_OUT, easing: EASE_EXIT };
// The gap the row leaves closes on the shared ease: the lines below rise into it.
const CLOSE = { duration: PANEL_SLIDE_OUT, easing: EASE };
// How strongly the tint washes the row at its peak: enough to read, with the text still clear.
const TINT_ADDED = 0.22;
const TINT_REMOVED = 0.3;
// The row's height while it is not collapsing: its own.
const NATURAL = -1;

/**
 * Table row with a pulse for add/remove feedback.
 *
 * The pulse is a tint laid OVER the row's content, and only its opacity animates. It used to
 * be the row's own background colour, which a row with an opaque body on top of it (the cart
 * line, whose body hides the swipe strip under it) covered completely: the row pulsed and
 * nobody could see it (filmed and probed 2026-10-02).
 *
 * A removal is tint, then the row's height closing to nothing, then the mutation: the line
 * leaves and the lines below rise into its place before the data changes under them, so the
 * gap never snaps shut (the cart line's swipe-to-remove, chosen 2026-10-08).
 */
function PulseTableRow<TData extends RowData, TFeatures extends TableFeatures>({
	ref,
	className,
	index: _index = 0,
	onRemove = () => {},
	row,
	table,
	children,
	onLayout,
	...viewProps
}: PulseTableRowProps<TData, TFeatures>) {
	const reduced = useReducedMotion();
	const added = useSharedValue(0);
	const removed = useSharedValue(0);
	const height = useSharedValue(NATURAL);
	const measured = React.useRef(0);
	const addedStyle = useAnimatedStyle(() => ({ opacity: added.value }));
	const removedStyle = useAnimatedStyle(() => ({ opacity: removed.value }));
	const rowStyle = useAnimatedStyle(() =>
		height.value < 0 ? {} : { height: height.value, minHeight: 0, overflow: 'hidden' as const }
	);

	/**
	 * `pulseRemove` commits the row's removal from the animation's completion
	 * callback, so a second call must NOT cancel and restart the pulse: reanimated
	 * resolves a cancelled animation with `finished === false`, which would drop
	 * the pending removal on the floor. That is exactly what repeated presses of
	 * the cart's remove button did — the row pulsed red forever and only removed
	 * itself 400ms after the cashier stopped clicking (wcpos/monorepo#1693).
	 *
	 * So: the first `pulseRemove` latches and later calls are no-ops. The latch is
	 * released again once the row demonstrably did not go away — the pulse was
	 * cancelled before it could commit, or the committed mutation settled without
	 * unmounting the row (a failed write leaves the line in the cart, and it must
	 * not be stuck unremovable for the rest of the session).
	 */
	const removePulseActive = React.useRef(false);
	const removePulseCallback = React.useRef<PulseRemoveCallback | null>(null);

	const settleRemovePulse = React.useCallback(
		(finished: boolean) => {
			const callback = removePulseCallback.current;
			removePulseCallback.current = null;

			if (!finished) {
				// Cancelled before it could commit: nothing was removed.
				removePulseActive.current = false;
				height.set(NATURAL);
				return;
			}

			// Committed. Hold the latch until the mutation settles so a press landing
			// mid-flight can't commit it twice, then release it: on success the row
			// unmounts and the latch is moot, and on failure the row is still here and
			// has to stay removable — at its own height again, not the closed gap. A
			// rejection keeps propagating — the callback owns reporting it.
			void Promise.resolve(callback?.()).finally(() => {
				removePulseActive.current = false;
				height.set(NATURAL);
			});
		},
		[height]
	);

	React.useImperativeHandle(
		ref,
		() => ({
			pulseAdd(callback?: () => void) {
				(table.options.meta as { scrollToRow?: (id: string) => void })?.scrollToRow?.(row.id);
				// One pulse at a time: an add takes over from a removal that has not committed.
				cancelAnimation(removed);
				cancelAnimation(added);
				removed.value = 0;
				added.value = withSequence(
					withTiming(TINT_ADDED, LIT),
					withTiming(0, SETTLE, (finished) => {
						'worklet';
						if (finished && callback) {
							scheduleOnRN(callback);
						}
					})
				);
			},
			armRemove(on: boolean) {
				if (removePulseActive.current) {
					return;
				}
				cancelAnimation(removed);
				removed.value = withTiming(on ? TINT_REMOVED : 0, LIT);
			},
			pulseRemove(callback?: PulseRemoveCallback) {
				if (removePulseActive.current) {
					return;
				}
				removePulseActive.current = true;
				removePulseCallback.current = callback ?? null;

				cancelAnimation(added);
				cancelAnimation(removed);
				added.value = 0;
				// Read on this thread: a worklet sees a ref only as the copy it captured.
				const from = measured.current;
				const close = !reduced && from > 0;
				removed.value = withTiming(TINT_REMOVED, GOING, (finished) => {
					'worklet';
					if (!finished || !close) {
						scheduleOnRN(settleRemovePulse, !!finished);
						return;
					}
					height.value = from;
					height.value = withTiming(0, CLOSE, (closed) => {
						'worklet';
						scheduleOnRN(settleRemovePulse, !!closed);
					});
				});
			},
		}),
		[added, removed, height, reduced, row.id, table, settleRemovePulse]
	);

	return (
		<Animated.View
			// No `web:transition-colors` here: a CSS colour transition on the row fights the pulse.
			className={cn(
				'bg-table-row web:data-[state=selected]:bg-muted border-border min-h-row relative flex-row border-b',
				className
			)}
			style={rowStyle}
			onLayout={(event) => {
				// The height the gap closes from. A collapsing row reports its shrinking height
				// too; keep the last natural one.
				if (height.get() < 0) measured.current = event.nativeEvent.layout.height;
				// The animated view types its handler as possibly a shared value; the table passes a function.
				(onLayout as ((e: LayoutChangeEvent) => void) | undefined)?.(event);
			}}
			{...viewProps}
		>
			{children as React.ReactNode}
			<Animated.View
				className="bg-success absolute inset-0"
				style={[addedStyle, { pointerEvents: 'none' }]}
			/>
			<Animated.View
				className="bg-destructive absolute inset-0"
				style={[removedStyle, { pointerEvents: 'none' }]}
			/>
		</Animated.View>
	);
}

PulseTableRow.displayName = 'PulseTableRow';

export { PulseTableRow };
export type { PulseTableRowRef };
