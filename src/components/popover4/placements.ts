import { ViewStyle } from 'react-native';

/**
 * Determines placement of the `Popover`.
 */
export type PopoverPlacement =
	| 'top'
	| 'top-start'
	| 'top-end'
	| 'bottom'
	| 'bottom-start'
	| 'bottom-end'
	| 'left'
	| 'left-start'
	| 'left-end'
	| 'right'
	| 'right-start'
	| 'right-end';

export const isTop = (placement: PopoverPlacement): placement is 'top' | 'top-start' | 'top-end' =>
	['top', 'top-start', 'top-end'].indexOf(placement) >= 0;

export const isBottom = (
	placement: PopoverPlacement
): placement is 'bottom' | 'bottom-start' | 'bottom-end' =>
	['bottom', 'bottom-start', 'bottom-end'].indexOf(placement) >= 0;

export const isLeft = (
	placement: PopoverPlacement
): placement is 'left' | 'left-start' | 'left-end' =>
	['left', 'left-start', 'left-end'].indexOf(placement) >= 0;

export const isRight = (
	placement: PopoverPlacement
): placement is 'right' | 'right-start' | 'right-end' =>
	['right', 'right-start', 'right-end'].indexOf(placement) >= 0;

export const isStart = (
	placement: PopoverPlacement
): placement is 'top-start' | 'bottom-start' | 'left-start' | 'right-start' =>
	['top-start', 'bottom-start', 'left-start', 'right-start'].indexOf(placement) >= 0;

export const isEnd = (
	placement: PopoverPlacement
): placement is 'top-end' | 'bottom-end' | 'left-end' | 'right-end' =>
	['top-end', 'bottom-end', 'left-end', 'right-end'].indexOf(placement) >= 0;

/**
 * Map container alignment to `PopoverPlacement`, eg: center/start/end.
 */
export const getContainerAlign = (
	placement: PopoverPlacement
): {
	alignItems: ViewStyle['alignItems'];
	justifyContent: ViewStyle['justifyContent'];
} => {
	if (isStart(placement)) return { alignItems: 'flex-start', justifyContent: 'flex-start' };
	if (isEnd(placement)) return { alignItems: 'flex-end', justifyContent: 'flex-end' };
	return { alignItems: 'center', justifyContent: 'center' };
};

/**
 * Map popover to `PopoverPlacement`, top, bottom, left or right of the target
 */
export const getPopoverPosition = (
	placement: PopoverPlacement
): {
	flexDirection: ViewStyle['flexDirection'];
	top?: ViewStyle['top'];
	left?: ViewStyle['left'];
	right?: ViewStyle['right'];
	bottom?: ViewStyle['bottom'];
} => {
	if (isTop(placement)) return { bottom: '100%', flexDirection: 'column' };
	if (isLeft(placement)) return { right: '100%', flexDirection: 'row' };
	if (isRight(placement)) return { left: '100%', flexDirection: 'row' };
	return { top: '100%', flexDirection: 'column' };
};

/**
 * Map arrow direction to `PopoverPlacement`, points towards the target.
 */
export const getArrowDirection = (placement: PopoverPlacement) => {
	if (isTop(placement)) return 'down';
	if (isLeft(placement)) return 'right';
	if (isRight(placement)) return 'left';
	return 'up';
};

/**
 * Map arrow alignment to `PopoverPlacement`, eg: center/start/end.
 */
export const getArrowAlign = (
	placement: PopoverPlacement
): {
	alignSelf: ViewStyle['alignSelf'];
	paddingTop?: ViewStyle['paddingTop'];
	paddingBottom?: ViewStyle['paddingBottom'];
	paddingLeft?: ViewStyle['paddingLeft'];
	paddingRight?: ViewStyle['paddingRight'];
} => {
	if (isStart(placement))
		return {
			alignSelf: 'flex-start',
			paddingTop: isLeft(placement) || isRight(placement) ? '6px' : 0,
			paddingLeft: isTop(placement) || isBottom(placement) ? '6px' : 0,
		};
	if (isEnd(placement))
		return {
			alignSelf: 'flex-end',
			paddingBottom: isLeft(placement) || isRight(placement) ? '6px' : 0,
			paddingRight: isTop(placement) || isBottom(placement) ? '6px' : 0,
		};
	return { alignSelf: 'center' };
};
