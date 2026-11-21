import * as React from 'react';
import type { LayoutChangeEvent } from 'react-native';

/** Viewport x a name cell's text must end before: its line's strip is open on a fine pointer. */
export const StripEdgeContext = React.createContext<number | null>(null);

/**
 * A cart line's name and meta while its strip is open on a fine pointer (the 2026-11-21 board):
 * each ends clear of the strip with an ellipsis and keeps the lines it had at rest, so the row's
 * height never moves. Measured from the DOM at rest; touch, native and a closed strip change nothing.
 */
export function useStripClear() {
	const edge = React.useContext(StripEdgeContext);
	const [rest, setRest] = React.useState<Record<string, { right: number; lines: number }>>({});
	return {
		/** A clamped text's line count: `max` at rest, the lines it had at rest while open. */
		lines: (key: string, max: number) =>
			edge === null ? max : Math.min(max, rest[key]?.lines ?? max),
		/** The box around that text (or the text itself): measured at rest, padded clear while open. */
		box: (key: string) => ({
			style: { paddingRight: edge === null ? 0 : Math.max(0, (rest[key]?.right ?? 0) - edge) },
			onLayout: (event: LayoutChangeEvent) => {
				const el = (event.nativeEvent as { target?: HTMLElement }).target;
				const text = el?.matches?.('[dir]') ? el : el?.querySelector?.<HTMLElement>('[dir]');
				if (edge !== null || !el || !text) return;
				const { height } = text.getBoundingClientRect();
				const lines = Math.round(height / parseFloat(getComputedStyle(text).lineHeight));
				const { right } = el.getBoundingClientRect();
				if (lines > 0) setRest((before) => ({ ...before, [key]: { right, lines } }));
			},
		}),
	};
}
