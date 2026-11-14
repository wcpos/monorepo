import * as React from 'react';

import { act, create } from 'react-test-renderer';

import { TrendLineChart } from './trend-line-chart';

jest.resetModules();

jest.mock('@wcpos/components/charts/lazy', () => ({
	loadCharts: () => new Promise(() => {}),
}));
jest.mock('react-native-gesture-handler', () => ({}));
jest.mock('react-native-reanimated', () => ({}));
jest.mock('react-native-worklets', () => ({}));
jest.mock('uniwind', () => ({}));
jest.mock('@wcpos/core/hooks/use-local-date', () => ({
	useLocalDate: () => ({ formatDate: () => '10:00 AM' }),
}));
jest.mock('@wcpos/components/hstack', () => {
	const { View } = jest.requireActual('react-native');
	return { HStack: View };
});
jest.mock('@wcpos/components/text', () => {
	const { Text } = jest.requireActual('react-native');
	return { Text };
});
jest.mock('@wcpos/core/contexts/translations', () => {
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

it('holds the frame while the chart code loads', () => {
	let renderer!: ReturnType<typeof create>;
	act(() => {
		renderer = create(
			<TrendLineChart
				points={[
					{ x: 1, y: 1 },
					{ x: 2, y: 2 },
				]}
				label="Requests"
				tone="accent"
				testID="t"
			/>
		);
	});
	expect(renderer.root.findAllByProps({ testID: 't' }).length).toBeGreaterThan(0);
	expect(renderer.root.findAllByProps({ testID: 't-label' })[0].props.children).toBe('Requests');
});
