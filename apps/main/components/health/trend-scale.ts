import type { TrendPoint } from './trend-frame';

/**
 * Axis scaffolding for the Store health trend charts — pure so the tick maths
 * is testable without loading Skia/Victory.
 */

/** Round up to the nearest 1/2/5 × 10^n — the classic "nice" axis ceiling. */
export function niceCeil(value: number): number {
	if (!Number.isFinite(value) || value <= 0) return 1;
	const magnitude = 10 ** Math.floor(Math.log10(value));
	const normalized = value / magnitude;
	const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
	return nice * magnitude;
}

/**
 * Up to `maxTicks` x ticks, taken from the plotted points themselves — the
 * buckets are hour-aligned, so ticks land on real clock hours instead of the
 * arbitrary millisecond values a generic linear scale would pick.
 */
export function xTickValues(points: TrendPoint[], maxTicks = 4): number[] {
	if (points.length === 0) return [];
	if (points.length <= maxTicks) return points.map((point) => point.x);
	const step = (points.length - 1) / (maxTicks - 1);
	const ticks = new Set<number>();
	for (let i = 0; i < maxTicks; i += 1) {
		ticks.add(points[Math.round(i * step)].x);
	}
	return [...ticks];
}

/** Baseline, midpoint, ceiling — three clean y ticks over a zero-based domain. */
export function yTickValues(domainTop: number): number[] {
	return [0, domainTop / 2, domainTop];
}
