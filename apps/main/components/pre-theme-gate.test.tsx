import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as React from 'react';
import { StyleSheet, Text } from 'react-native';

import { fireEvent, render } from '@testing-library/react-native';

import { PreThemeGate } from './pre-theme-gate';
import { PRE_THEME_COLOURS } from './pre-theme-colours';

jest.mock('react-native-safe-area-context', () => ({
	SafeAreaView: jest.requireActual('react-native').View,
}));

const flat = (node: { props: { style?: unknown } }) =>
	StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;

it('renders title, line, detail and an extra block under derived testIDs', async () => {
	const screen = await render(
		<PreThemeGate tone="bad" title="Oops" description="Line" detail="TypeError: boom" testID="g">
			<Text testID="extra">More</Text>
		</PreThemeGate>
	);
	expect(screen.getByTestId('g-title').props.children).toBe('Oops');
	expect(screen.getByTestId('g-description').props.children).toBe('Line');
	expect(screen.getByTestId('g-detail').props.children).toBe('TypeError: boom');
	expect(screen.getByTestId('extra')).toBeTruthy();
	expect(screen.queryByTestId('g-primary')).toBeNull();
});

it('keeps the title in foreground ink whatever the tone', async () => {
	for (const tone of ['warn', 'bad', 'muted'] as const) {
		const screen = await render(<PreThemeGate tone={tone} title="T" />);
		expect(flat(screen.getByTestId('pre-theme-gate-title')).color).toBe(
			PRE_THEME_COLOURS.foreground
		);
		await screen.unmount();
	}
});

it('stacks the primary before the secondary, fires each, and holds a disabled one', async () => {
	const primary = jest.fn();
	const secondary = jest.fn();
	const screen = await render(
		<PreThemeGate
			tone="warn"
			title="T"
			primary={{ label: 'Go', onPress: primary, testID: 'own-primary' }}
			secondary={{ label: 'Back', onPress: secondary, disabled: true }}
		/>
	);
	await fireEvent.press(screen.getByTestId('own-primary'));
	await fireEvent.press(screen.getByTestId('pre-theme-gate-secondary'));
	expect(primary).toHaveBeenCalledTimes(1);
	expect(secondary).not.toHaveBeenCalled();
	expect(screen.getByTestId('pre-theme-gate-secondary')).toBeDisabled();
});

it('draws the default icon set’s glyphs, so the pre-theme disc matches GateScreen’s', () => {
	const source = readFileSync(join(__dirname, 'pre-theme-gate.tsx'), 'utf8');
	const tabler = join(__dirname, '../../../packages/components/src/icon/components/tabler');
	for (const name of ['warning', 'alert', 'info']) {
		const glyph = readFileSync(join(tabler, `${name}.tsx`), 'utf8');
		const paths = [...glyph.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1]);
		expect(paths.length).toBeGreaterThan(0);
		for (const d of paths) expect(source).toContain(`'${d}'`);
	}
});
