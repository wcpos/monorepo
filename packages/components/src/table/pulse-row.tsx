import * as React from 'react';

import Animated, {
	cancelAnimation,
	useAnimatedStyle,
	useSharedValue,
	withSequence,
	withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useCSSVariable } from 'uniwind';

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

/**
 * Table row with pulse animation for add/remove feedback.
 * Uses theme-aware colors for alternating rows and pulse effects.
 */
function PulseTableRow<TData extends RowData, TFeatures extends TableFeatures>({
	ref,
	className,
	index = 0,
	onRemove = () => {},
	row,
	table,
	...viewProps
}: PulseTableRowProps<TData, TFeatures>) {
	// Get theme-aware colors
	const [tableRowColor, tableRowAltColor, successColor, errorColor] = useCSSVariable([
		'--color-table-row',
		'--color-table-row-alt',
		'--color-success',
		'--color-error',
	]) as string[];

	// Determine the base color based on row index
	const baseColor = index % 2 === 0 ? tableRowColor : tableRowAltColor;

	// Shared value for animated background color
	const backgroundColor = useSharedValue(baseColor);

	// Update base color when theme colors change (baseColor already derives from index)
	React.useEffect(() => {
		backgroundColor.value = baseColor;
	}, [baseColor, backgroundColor]);

	const animatedStyle = useAnimatedStyle(() => {
		return {
			backgroundColor: backgroundColor.value,
		};
	});

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
				cancelAnimation(backgroundColor);
				// Pulse to success color then back to base
				backgroundColor.value = withSequence(
					withTiming(successColor, { duration: 400 }),
					withTiming(baseColor, { duration: 400 }, (finished) => {
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

				cancelAnimation(backgroundColor);
				// Pulse to error color
				backgroundColor.value = withTiming(errorColor, { duration: 400 }, (finished) => {
					'worklet';
					scheduleOnRN(settleRemovePulse, !!finished);
				});
			},
		}),
		[backgroundColor, baseColor, successColor, errorColor, row.id, table, settleRemovePulse]
	);

	return (
		<Animated.View
			// No `web:transition-colors` here: a CSS background-color transition
			// low-pass-filters reanimated's per-frame inline style updates, so the
			// pulse never reaches the success/error color and visibly lags/snaps.
			className={cn('web:data-[state=selected]:bg-muted flex-row', className)}
			style={animatedStyle}
			{...viewProps}
		/>
	);
}

PulseTableRow.displayName = 'PulseTableRow';

export { PulseTableRow };
export type { PulseTableRowRef };
