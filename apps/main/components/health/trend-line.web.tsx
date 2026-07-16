import * as React from 'react';

import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { version } from 'canvaskit-wasm/package.json';

import { Text } from '@wcpos/components/text';

import type { TrendPoint } from './trend-line-chart';

/**
 * Web must lazy-load CanvasKit before any Skia/Victory render (the reports
 * chart's established pattern) — a direct import is the known failure path.
 */
export const TrendLine = React.memo(
	(props: { points: TrendPoint[]; label: string; tone: 'accent' | 'neutral'; testID: string }) => {
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
				fallback={<Text>…</Text>}
			/>
		);
	}
);

TrendLine.displayName = 'TrendLine';

export type { TrendPoint };
