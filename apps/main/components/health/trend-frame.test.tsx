import * as React from 'react';

import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { TrendFrame } from './trend-frame';

// Reset at module scope to avoid jest-expo's winter-runtime "require outside test scope" error.
jest.resetModules();

jest.mock('@wcpos/components/hstack', () => {
	const { View } = jest.requireActual('react-native');
	return { HStack: View };
});
jest.mock('@wcpos/components/text', () => {
	const { Text } = jest.requireActual('react-native');
	return { Text };
});
jest.mock('@wcpos/core/contexts/translations', () => {
	// Resolve from the catalog the app actually registers as its `en` resource,
	// so assertions on rendered copy match what ships.
	const en = jest.requireActual<Record<string, string>>(
		'@wcpos/core/contexts/translations/locales/en/core.json'
	);
	return {
		useT: () => (key: string, values?: Record<string, unknown>) => {
			const template = en[key] ?? key;
			return values
				? template.replace(/\{(\w+)\}/g, (match, name: string) =>
						values[name] === undefined ? match : String(values[name])
					)
				: template;
		},
	};
});

const WAITING = 'Not enough data yet — this trend fills in as the till runs';

/** Stands in for the drawn trend, so tests can tell "drew a line" from "didn't". */
function ChartStub() {
	return null;
}

const point = (x: number, y: number) => ({ x, y });

function renderFrame(element: React.ReactElement): ReactTestRenderer {
	let renderer!: ReactTestRenderer;
	act(() => {
		renderer = create(element);
	});
	return renderer;
}

/** The outermost node carrying a testID renders its text as plain children. */
function textOf(renderer: ReactTestRenderer, testID: string): unknown {
	const found = renderer.root.findAllByProps({ testID });
	expect(found.length).toBeGreaterThan(0);
	return found[0].props.children;
}

function has(renderer: ReactTestRenderer, testID: string): boolean {
	return renderer.root.findAllByProps({ testID }).length > 0;
}

describe('TrendFrame', () => {
	it('draws the frame and a waiting line with no samples at all', () => {
		const renderer = renderFrame(
			<TrendFrame points={[]} label="server load" testID="server-load-trend">
				<ChartStub />
			</TrendFrame>
		);

		// The frame itself is present, so the page holds its full footprint from
		// the first render — the bug was this collapsing to a caption row.
		expect(has(renderer, 'server-load-trend')).toBe(true);
		expect(textOf(renderer, 'server-load-trend-waiting')).toBe(WAITING);
		expect(textOf(renderer, 'server-load-trend-label')).toBe('server load');
		// Nothing measured, so no value is claimed and no trend is drawn.
		expect(textOf(renderer, 'server-load-trend-latest')).toBe('—');
		expect(renderer.root.findAllByType(ChartStub)).toHaveLength(0);
	});

	it('keeps the waiting line for a single sample but still reports its real value', () => {
		const renderer = renderFrame(
			<TrendFrame points={[point(1, 42)]} label="server load" testID="server-load-trend">
				<ChartStub />
			</TrendFrame>
		);

		expect(has(renderer, 'server-load-trend-waiting')).toBe(true);
		// One sample is not a trend, but it is still true.
		expect(textOf(renderer, 'server-load-trend-latest')).toBe('42');
		expect(renderer.root.findAllByType(ChartStub)).toHaveLength(0);
	});

	it('reports a latest value of zero rather than an em dash', () => {
		const renderer = renderFrame(
			<TrendFrame points={[point(1, 0)]} label="server load" testID="server-load-trend" />
		);

		expect(textOf(renderer, 'server-load-trend-latest')).toBe('0');
	});

	it('draws the trend once there are two samples, dropping the waiting line', () => {
		const renderer = renderFrame(
			<TrendFrame
				points={[point(1, 10), point(2, 20)]}
				label="POS requests · same period"
				testID="pos-requests-trend"
			>
				<ChartStub />
			</TrendFrame>
		);

		// Purely additive: same frame, same caption row — the line replaces the text.
		expect(has(renderer, 'pos-requests-trend')).toBe(true);
		expect(has(renderer, 'pos-requests-trend-waiting')).toBe(false);
		expect(renderer.root.findAllByType(ChartStub)).toHaveLength(1);
		expect(textOf(renderer, 'pos-requests-trend-label')).toBe('POS requests · same period');
		expect(textOf(renderer, 'pos-requests-trend-latest')).toBe('20');
	});

	it('holds the frame with no line while the chart engine loads', () => {
		// The web fallback path: enough points to draw, but CanvasKit hasn't landed.
		const renderer = renderFrame(
			<TrendFrame
				points={[point(1, 10), point(2, 20)]}
				label="POS requests · same period"
				testID="pos-requests-trend"
			/>
		);

		expect(has(renderer, 'pos-requests-trend')).toBe(true);
		// Not "not enough data" — there is enough, it just isn't drawn yet.
		expect(has(renderer, 'pos-requests-trend-waiting')).toBe(false);
		expect(textOf(renderer, 'pos-requests-trend-latest')).toBe('20');
	});
});
