import * as React from 'react';

import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PerformanceScreen } from './performance-screen';

import type { MetricsBucket } from '../../lib/metrics';

// Reset at module scope to avoid jest-expo's winter-runtime "require outside test scope" error.
jest.resetModules();

const HOUR_MS = 60 * 60 * 1000;
const NOW = 100 * HOUR_MS;

let mockBuckets: MetricsBucket[] = [];
const mockTranslationKeys: string[] = [];

type MockTrendProps = {
	testID: string;
	points: { x: number; y: number }[];
	formatValue?: (value: number) => string;
};

/** Records what each trend was asked to draw, without loading Skia/Victory. */
const mockTrendProps: MockTrendProps[] = [];

jest.mock('../../lib/metrics', () => ({
	getMetricsBuckets: () => mockBuckets,
}));
jest.mock('./trend-line', () => ({
	TrendLine: (props: MockTrendProps) => {
		mockTrendProps.push(props);
		return null;
	},
}));
jest.mock('./uptime-strip', () => ({ UptimeStrip: () => null }));
jest.mock('observable-hooks', () => ({ useObservableEagerState: () => undefined }));
jest.mock('@wcpos/query', () => ({
	...jest.requireActual('@wcpos/query'),
	// Mirrors the observable-hooks stub above: settings fields read as undefined -> defaults.
	useDocField: () => undefined,
}));
jest.mock('@wcpos/core/contexts/app-state', () => ({
	useAppState: () => ({ store: {} }),
}));
jest.mock('@wcpos/core/contexts/translations', () => {
	// Resolve from the catalog the app actually registers as its `en` resource,
	// so assertions on rendered copy match what ships.
	const en = jest.requireActual<Record<string, string>>(
		'@wcpos/core/contexts/translations/locales/en/core.json'
	);
	return {
		useT: () => (key: string, values?: Record<string, unknown>) => {
			mockTranslationKeys.push(key);
			const template = en[key] ?? key;
			return values
				? template.replace(/\{(\w+)\}/g, (match, name: string) =>
						values[name] === undefined ? match : String(values[name])
					)
				: template;
		},
	};
});
jest.mock('@wcpos/core/screens/main/hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: jest.fn() }),
}));
jest.mock('@wcpos/core/screens/main/hooks/use-engine-monitor', () => ({
	useEngineStatus: () => ({
		connectivity: 'online',
		gatedBy: null,
		bootstrapFailed: {},
		lanes: {},
	}),
}));
jest.mock('@wcpos/core/screens/main/logs/logs-logic', () => ({
	formatCadence: () => null,
}));
jest.mock('@wcpos/core/screens/main/health/components', () => {
	const { View } = jest.requireActual('react-native');
	return {
		Section: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
			<View testID={testID}>{children}</View>
		),
	};
});
jest.mock('@wcpos/components/button', () => {
	const { Text, View } = jest.requireActual('react-native');
	return {
		Button: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
		ButtonText: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
	};
});
jest.mock('@wcpos/components/hstack', () => {
	const { View } = jest.requireActual('react-native');
	return { HStack: View };
});
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/label', () => {
	const { Text } = jest.requireActual('react-native');
	return { Label: Text };
});
jest.mock('@wcpos/components/radio-group', () => {
	const { View } = jest.requireActual('react-native');
	return { RadioGroup: View, RadioGroupItem: View };
});
jest.mock('@wcpos/components/slider', () => {
	const { View } = jest.requireActual('react-native');
	return { Slider: View };
});
jest.mock('@wcpos/components/text', () => {
	const { Text } = jest.requireActual('react-native');
	return { Text };
});
jest.mock('@wcpos/components/vstack', () => {
	const { View } = jest.requireActual('react-native');
	return { VStack: View };
});

const bucket = (hoursAgo: number, requests: number, load?: number): MetricsBucket => ({
	hourStartMs: NOW - hoursAgo * HOUR_MS,
	requests,
	bytes: 0,
	durationTotalMs: 0,
	durationCount: 0,
	errors: 0,
	...(load === undefined ? {} : { loadLast: load, loadMax: load }),
});

let rendered: ReactTestRenderer | null = null;

function renderScreen(buckets: MetricsBucket[]): ReactTestRenderer {
	mockBuckets = buckets;
	mockTrendProps.length = 0;
	mockTranslationKeys.length = 0;
	act(() => {
		rendered = create(<PerformanceScreen />);
	});
	return rendered as unknown as ReactTestRenderer;
}

const trend = (testID: string) => mockTrendProps.find((entry) => entry.testID === testID);
const loadUnavailableShown = (renderer: ReactTestRenderer) =>
	renderer.root.findAllByProps({ testID: 'server-load-unavailable' }).length > 0;

describe('PerformanceScreen · server over time', () => {
	beforeEach(() => {
		// The screen re-reads the metrics on a 10 s interval; keep it off the
		// real clock so nothing fires after the environment is torn down.
		jest.useFakeTimers();
		jest.spyOn(Date, 'now').mockReturnValue(NOW);
	});
	afterEach(() => {
		if (rendered) {
			const renderer = rendered;
			act(() => renderer.unmount());
			rendered = null;
		}
		jest.restoreAllMocks();
		jest.useRealTimers();
	});

	it('mounts both trend frames on a brand-new till', () => {
		// The #910 regression: the POS requests trend rendered nothing at all
		// until the till had made a request, so the section looked broken minutes
		// after setup. Neither chart may claim anything about an unasked server.
		const renderer = renderScreen([]);
		expect(trend('pos-requests-trend')?.points).toEqual([]);
		expect(trend('server-load-trend')?.points).toEqual([]);
		expect(loadUnavailableShown(renderer)).toBe(false);
	});

	it('keeps the wider health layout with the shared screen spacing', () => {
		const renderer = renderScreen([]);
		const screen = renderer.root.findByProps({ testID: 'screen-health-performance' });

		expect(screen.props.className).toBe(
			'mx-auto w-full max-w-4xl gap-6 px-4 py-6 md:px-10 md:py-8'
		);
	});

	it('says the server does not report load once it has been asked and stayed silent', () => {
		// Distinct from "not enough data yet": a plain sentence, no chart frame.
		const renderer = renderScreen([bucket(2, 10), bucket(1, 20)]);
		expect(loadUnavailableShown(renderer)).toBe(true);
		expect(trend('server-load-trend')).toBeUndefined();
		expect(trend('pos-requests-trend')?.points).toHaveLength(2);
	});

	it('shows the load trend frame from the very first load sample', () => {
		const renderer = renderScreen([bucket(1, 20, 1.5)]);
		expect(trend('server-load-trend')?.points).toEqual([{ x: NOW - HOUR_MS, y: 1.5 }]);
		// One sample is not "load unavailable" — the frame says "not enough yet".
		expect(loadUnavailableShown(renderer)).toBe(false);
	});

	it('plots both trends once there is history', () => {
		const renderer = renderScreen([bucket(2, 10, 0.5), bucket(1, 20, 1.5)]);
		expect(trend('server-load-trend')?.points).toHaveLength(2);
		expect(trend('pos-requests-trend')?.points).toEqual([
			{ x: NOW - 2 * HOUR_MS, y: 10 },
			{ x: NOW - HOUR_MS, y: 20 },
		]);
		expect(loadUnavailableShown(renderer)).toBe(false);
	});

	it('exposes each preset card as only its labeled radio control', () => {
		const renderer = renderScreen([]);
		const card = renderer.root.findByProps({ testID: 'preset-eco' });
		expect(card.props.onPress).toBeUndefined();
	});

	it('routes check-frequency endpoint labels through translations', () => {
		renderScreen([]);
		expect(mockTranslationKeys).toEqual(
			expect.arrayContaining([
				'health.performance.seconds_short',
				'health.performance.minutes_short',
			])
		);
	});

	it('keeps low-volume request-axis labels distinct', () => {
		renderScreen([bucket(2, 0), bucket(1, 1)]);
		const formatValue = trend('pos-requests-trend')?.formatValue;
		expect(formatValue).toBeDefined();
		expect([0, 0.5, 1].map((value) => formatValue?.(value))).toEqual(['0', '0.5', '1']);
	});

	it('keeps a fractional digit on integer-valued load averages', () => {
		renderScreen([bucket(2, 1, 1), bucket(1, 1, 14)]);
		const formatValue = trend('server-load-trend')?.formatValue;
		expect(formatValue).toBeDefined();
		expect([1, 14].map((value) => formatValue?.(value))).toEqual(['1.0', '14.0']);
	});

	it('states the request budget per hour, not per day', () => {
		const renderer = renderScreen([]);
		const mathLine = renderer.root.findByProps({ testID: 'settings-math-line' });
		// Default 60 s interval → 60 requests/hour, rendered from the shipped en catalogue.
		expect(String(mathLine.props.children)).toContain('~60 requests per hour');
	});
});
