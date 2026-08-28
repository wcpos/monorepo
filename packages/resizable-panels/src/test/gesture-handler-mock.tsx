import React from 'react';

export type GestureEvent = { translationX: number; translationY: number };
export type RecordedHitSlop = {
	left?: number;
	right?: number;
	top?: number;
	bottom?: number;
};
export type RecordedGesture = {
	type: 'pan' | 'tap';
	begin?: () => void;
	update?: (event: GestureEvent) => void;
	end?: () => void;
	finalize?: () => void;
	hitSlopValue?: RecordedHitSlop;
	numberOfTapsValue?: number;
	hitSlop: (value: RecordedHitSlop) => RecordedGesture;
	numberOfTaps: (count: number) => RecordedGesture;
	onBegin: (callback: () => void) => RecordedGesture;
	onUpdate: (callback: (event: GestureEvent) => void) => RecordedGesture;
	onEnd: (callback: () => void) => RecordedGesture;
	onFinalize: (callback: () => void) => RecordedGesture;
};

export const gestureRegistry: RecordedGesture[] = [];

function createGesture(type: RecordedGesture['type']) {
	const gesture: RecordedGesture = {
		type,
		hitSlop(value) {
			gesture.hitSlopValue = value;
			return gesture;
		},
		numberOfTaps(count) {
			gesture.numberOfTapsValue = count;
			return gesture;
		},
		onBegin(callback) {
			gesture.begin = callback;
			return gesture;
		},
		onUpdate(callback) {
			gesture.update = callback;
			return gesture;
		},
		onEnd(callback) {
			gesture.end = callback;
			return gesture;
		},
		onFinalize(callback) {
			gesture.finalize = callback;
			return gesture;
		},
	};
	gestureRegistry.push(gesture);
	return gesture;
}

export const Gesture = {
	Pan: () => createGesture('pan'),
	Tap: () => createGesture('tap'),
	Race: (...gestures: RecordedGesture[]) => gestures[0],
};

export function GestureDetector({ children }: { children: React.ReactNode }) {
	return <>{children}</>;
}
