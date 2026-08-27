import React from 'react';

export type GestureEvent = { translationX: number; translationY: number };
export type RecordedGesture = {
	begin?: () => void;
	update?: (event: GestureEvent) => void;
	end?: () => void;
	onBegin: (callback: () => void) => RecordedGesture;
	onUpdate: (callback: (event: GestureEvent) => void) => RecordedGesture;
	onEnd: (callback: () => void) => RecordedGesture;
};

export const gestureRegistry: RecordedGesture[] = [];

export const Gesture = {
	Pan: () => {
		const gesture: RecordedGesture = {
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
		};
		gestureRegistry.push(gesture);
		return gesture;
	},
};

export function GestureDetector({ children }: { children: React.ReactNode }) {
	return <>{children}</>;
}
