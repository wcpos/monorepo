import * as React from 'react';

import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { version } from 'canvaskit-wasm/package.json';

import { MIN_TREND_POINTS, TrendFrame, type TrendPoint } from './trend-frame';

/**
 * Web must lazy-load CanvasKit before any Skia/Victory render (the reports
 * chart's established pattern) — a direct import is the known failure path.
 *
 * Nothing to draw means nothing to load: below two samples the frame renders
 * on its own, so a fresh till gets the chart's footprint immediately instead
 * of waiting on a CDN download it has no use for. Once there is a trend, that
 * same frame is the loading fallback, so CanvasKit arriving only adds a line.
 */
export const TrendLine = React.memo(
	(props: { points: TrendPoint[]; label: string; tone: 'accent' | 'neutral'; testID: string }) => {
		const frame = <TrendFrame points={props.points} label={props.label} testID={props.testID} />;

		if (props.points.length < MIN_TREND_POINTS) return frame;

		return (
			<WithSkiaWeb
				opts={{
					locateFile: (file) =>
						`https://cdn.jsdelivr.net/npm/canvaskit-wasm@${version}/bin/full/${file}`,
				}}
				getComponent={async () => {
					const module = await import('./trend-line-chart');
					return { default: () => <module.TrendLineChart {...props} /> };
				}}
				fallback={frame}
			/>
		);
	}
);

TrendLine.displayName = 'TrendLine';

export type { TrendPoint };
