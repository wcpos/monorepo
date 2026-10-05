import * as React from 'react';

import Animated, {
	cancelAnimation,
	useAnimatedStyle,
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
	pulseRemove: (callback?: PulseRemoveCallback) => void;
}

// The added line lights up at once and settles back: a flash that answers the tap, then a
// slow release (540 ms in all, where 400 + 400 read as a row slowly changing colour).
const LIT = { duration: 120, easing: EASE };
const SETTLE = { duration: 420, easing: EASE };
// The removal waits on this pulse, so it is short: nothing over 400 ms on a path the cashier
// is waiting on.
const GOING = { duration: PANEL_SLIDE_OUT, easing: EASE_EXIT };
// How strongly the tint washes the row at its peak: enough to read, with the text still clear.
const TINT_ADDED = 0.22;
const TINT_REMOVED = 0.3;

/**
 * Table row with a pulse for add/remove feedback.
 *
 * The pulse is a tint laid OVER the row's content, and only its opacity animates. It used to
 * be the row's own background colour, which a row with an opaque body on top of it (the cart
 * line, whose body hides the swipe strip under it) covered completely: the row pulsed and
 * nobody could see it (filmed and probed 2026-10-02).
 */
function PulseTableRow<TData extends RowData, TFeatures extends TableFeatures>({
	ref,
	className,
	index: _index = 0,
	onRemove = () => {},
	row,
	table,
	children,
	...viewProps
}: PulseTableRowProps<TData, TFeatures>) {
	const added = useSharedValue(0);
	const removed = useSharedValue(0);
	const addedStyle = useAnimatedStyle(() => ({ opacity: added.value }));
	const removedStyle = useAnimatedStyle(() => ({ opacity: removed.value }));

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

	const settleRemovePulse = React.useCallback((finished: boolean) => {
		const callback = removePulseCallback.current;
		removePulseCallback.current = null;

		if (!finished) {
			// Cancelled before it could commit: nothing was removed.
			removePulseActive.current = false;
			return;
		}

		// Committed. Hold the latch until the mutation settles so a press landing
		// mid-flight can't commit it twice, then release it: on success the row
		// unmounts and the latch is moot, and on failure the row is still here and
		// has to stay removable. A rejection keeps propagating — the callback owns
		// reporting it.
		void Promise.resolve(callback?.()).finally(() => {
			removePulseActive.current = false;
		});
	}, []);

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
			pulseRemove(callback?: PulseRemoveCallback) {
				if (removePulseActive.current) {
					return;
				}
				removePulseActive.current = true;
				removePulseCallback.current = callback ?? null;

				cancelAnimation(added);
				cancelAnimation(removed);
				added.value = 0;
				removed.value = withTiming(TINT_REMOVED, GOING, (finished) => {
					'worklet';
					scheduleOnRN(settleRemovePulse, !!finished);
				});
			},
		}),
		[added, removed, row.id, table, settleRemovePulse]
	);

	return (
		<Animated.View
			// No `web:transition-colors` here: a CSS colour transition on the row fights the pulse.
			className={cn(
				'bg-table-row web:data-[state=selected]:bg-muted border-border min-h-row relative flex-row border-b',
				className
			)}
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
