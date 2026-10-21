import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { PRE_THEME_COLOURS } from './pre-theme-colours';
import { PreThemeGate } from './pre-theme';

// react-native-web turns StyleSheet into atomic classes; these stand-ins keep the flattened
// style readable (`data-style`) and the press and disabled semantics of the real controls.
jest.mock('react-native', () => {
	const React = jest.requireActual('react');
	const RN = jest.requireActual('react-native');
	const props = ({ testID, style }: { testID?: string; style?: unknown }) => ({
		'data-testid': testID,
		'data-style': JSON.stringify(RN.StyleSheet.flatten(style) ?? {}),
	});
	return {
		...RN,
		View: (p: any) => React.createElement('div', props(p), p.children),
		ScrollView: (p: any) => React.createElement('div', props(p), p.children),
		Text: (p: any) => React.createElement(p.role === 'heading' ? 'h1' : 'p', props(p), p.children),
		TouchableOpacity: (p: any) =>
			React.createElement(
				'button',
				{ ...props(p), disabled: p.disabled, onClick: p.onPress },
				p.children
			),
	};
});
jest.mock('../logo', () => ({ Logo: () => null }));
jest.mock('../icon/components/tabler/alert', () => ({
	SvgAlert: ({ color }: { color: string }) => <i data-glyph="alert" data-color={color} />,
}));
jest.mock('../icon/components/tabler/warning', () => ({
	SvgWarning: ({ color }: { color: string }) => <i data-glyph="warning" data-color={color} />,
}));
jest.mock('../icon/components/tabler/info', () => ({
	SvgInfo: ({ color }: { color: string }) => <i data-glyph="info" data-color={color} />,
}));

const style = (testID: string) => JSON.parse(screen.getByTestId(testID).dataset.style!);

it('renders title, line, detail and an extra block under derived testIDs', () => {
	render(
		<PreThemeGate tone="bad" title="Oops" description="Line" detail="TypeError: boom" testID="g">
			<p data-testid="extra">More</p>
		</PreThemeGate>
	);
	expect(screen.getByTestId('g-title')).toHaveTextContent('Oops');
	expect(screen.getByTestId('g-description')).toHaveTextContent('Line');
	expect(screen.getByTestId('g-detail')).toHaveTextContent('TypeError: boom');
	expect(screen.getByTestId('extra')).toBeInTheDocument();
	expect(screen.queryByTestId('g-primary')).toBeNull();
});

it.each([
	['warn', 'warning', PRE_THEME_COLOURS.warnBg, PRE_THEME_COLOURS.warnText],
	['bad', 'alert', PRE_THEME_COLOURS.badBg, PRE_THEME_COLOURS.bad],
	['muted', 'info', PRE_THEME_COLOURS.muted, PRE_THEME_COLOURS.mutedForeground],
] as const)('puts the %s tone on the disc, never on the title', (tone, glyph, disc, ink) => {
	const { container } = render(<PreThemeGate tone={tone} title="T" />);
	const icon = container.querySelector('[data-glyph]') as HTMLElement;
	expect(icon.dataset.glyph).toBe(glyph);
	expect(icon.dataset.color).toBe(ink);
	expect(JSON.parse(icon.parentElement!.dataset.style!).backgroundColor).toBe(disc);
	expect(style('pre-theme-gate-title').color).toBe(PRE_THEME_COLOURS.foreground);
});

it('stacks the primary before the secondary, fires each, and holds a disabled one', () => {
	const primary = jest.fn();
	const secondary = jest.fn();
	render(
		<PreThemeGate
			tone="warn"
			title="T"
			primary={{ label: 'Go', onPress: primary, testID: 'own-primary' }}
			secondary={{ label: 'Back', onPress: secondary, disabled: true }}
		/>
	);
	const first = screen.getByTestId('own-primary');
	const second = screen.getByTestId('pre-theme-gate-secondary');
	expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	fireEvent.click(first);
	fireEvent.click(second);
	expect(primary).toHaveBeenCalledTimes(1);
	expect(secondary).not.toHaveBeenCalled();
	expect(second).toBeDisabled();
});

it('fills a destructive primary with the destructive token, and outlines the secondary whatever its flag', () => {
	render(
		<PreThemeGate
			tone="bad"
			title="T"
			primary={{ label: 'Reset', onPress: jest.fn(), destructive: true }}
			secondary={{ label: 'Cancel', onPress: jest.fn(), destructive: true }}
		/>
	);
	expect(style('pre-theme-gate-primary').backgroundColor).toBe(PRE_THEME_COLOURS.destructive);
	expect(style('pre-theme-gate-secondary').backgroundColor).toBe(PRE_THEME_COLOURS.card);
});
