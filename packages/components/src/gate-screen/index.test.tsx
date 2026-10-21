import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { openExternalURL } from '@wcpos/utils/open-external-url';

import { DeviceScope } from '../lib/device';
import { GateScreen } from './index';

// Uniwind is not compiled in Jest; expose View/ScrollView classes, keeping real web pressables.
jest.mock('react-native', () => {
	const React = jest.requireActual('react');
	const toDiv = ({
		testID,
		contentContainerClassName,
		keyboardShouldPersistTaps,
		...props
	}: {
		testID?: string;
		contentContainerClassName?: string;
		keyboardShouldPersistTaps?: string;
	}) => React.createElement('div', { ...props, 'data-testid': testID });
	return { ...jest.requireActual('react-native'), View: toDiv, ScrollView: toDiv };
});
jest.mock('@rn-primitives/slot', () => ({ Slot: 'span' }));
jest.mock('expo-haptics', () => ({
	impactAsync: jest.fn(),
	ImpactFeedbackStyle: { Light: 'light' },
}));
// SVG/native animation runtimes are outside these composition tests.
jest.mock('../icon', () => ({
	Icon: ({ name, className }: { name: string; className?: string }) =>
		React.createElement('span', { 'data-icon': name, className }),
}));
jest.mock('../logo', () => ({
	Logo: ({ width }: { width: number }) => React.createElement('span', { 'data-logo': width }),
}));
jest.mock('../loader', () => ({ Loader: () => null }));
jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));

const disc = (container: HTMLElement) => container.querySelector('[data-icon]')!.parentElement!;
const card = () => screen.getByTestId('gate-screen-title').closest('.bg-card')!;

it('renders title, description and the one detail line under derived testIDs', () => {
	render(
		<GateScreen
			tone="bad"
			title="Something went wrong"
			description="Reload to try again."
			detail="TypeError: boom"
		/>
	);
	expect(screen.getByTestId('gate-screen')).toBeInTheDocument();
	expect(screen.getByTestId('gate-screen-title')).toHaveTextContent('Something went wrong');
	expect(screen.getByTestId('gate-screen-description')).toHaveTextContent('Reload to try again.');
	expect(screen.getByTestId('gate-screen-detail')).toHaveTextContent('TypeError: boom');
});

it('omits description and detail when absent', () => {
	render(<GateScreen tone="muted" title="Title" />);
	expect(screen.queryByTestId('gate-screen-description')).toBeNull();
	expect(screen.queryByTestId('gate-screen-detail')).toBeNull();
});

it.each([
	['warn', 'bg-warn-bg', 'text-warn-text', 'warning'],
	['bad', 'bg-bad-bg', 'text-bad', 'alert'],
	['muted', 'bg-muted', 'text-muted-foreground', 'info'],
] as const)('puts the %s tone on the disc, never on the title', (tone, surface, glyph, icon) => {
	const { container } = render(<GateScreen tone={tone} title="Title" />);
	expect(disc(container)).toHaveClass('size-14', 'rounded-full', surface);
	expect(container.querySelector('[data-icon]')).toHaveAttribute('data-icon', icon);
	expect(container.querySelector('[data-icon]')).toHaveClass(glyph);
});

it('lets a custom icon win over the tone glyph', () => {
	const { container } = render(<GateScreen tone="muted" icon="help" title="Title" />);
	expect(container.querySelector('[data-icon]')).toHaveAttribute('data-icon', 'help');
});

it('stacks the primary before the secondary and fires each', () => {
	const primary = jest.fn();
	const secondary = jest.fn();
	render(
		<GateScreen
			tone="warn"
			title="Title"
			primary={{ label: 'Reload', onPress: primary }}
			secondary={{ label: 'Logout', onPress: secondary, testID: 'own-logout' }}
		/>
	);
	const first = screen.getByTestId('gate-screen-primary');
	const second = screen.getByTestId('own-logout');
	expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	fireEvent.click(first);
	fireEvent.click(second);
	expect(primary).toHaveBeenCalledTimes(1);
	expect(secondary).toHaveBeenCalledTimes(1);
});

it('renders one button when there is no secondary', () => {
	render(<GateScreen tone="muted" title="Title" primary={{ label: 'Go', onPress: jest.fn() }} />);
	expect(screen.getAllByRole('button')).toHaveLength(1);
	expect(screen.queryByTestId('gate-screen-secondary')).toBeNull();
});

it('shows the docs code on the link and opens the docs', () => {
	render(
		<GateScreen
			tone="warn"
			title="Title"
			docs={{ label: 'Learn more', href: 'https://docs.wcpos.com/x', code: 'SYNC341' }}
		/>
	);
	const link = screen.getByTestId('gate-screen-docs');
	expect(link).toHaveTextContent('Learn more');
	expect(link).toHaveTextContent('SYNC341');
	fireEvent.click(link);
	expect(openExternalURL).toHaveBeenCalledWith('https://docs.wcpos.com/x');
});

it.each([
	[true, 'p-4', 'p-8', '64'],
	[false, 'p-8', 'p-4', '80'],
])('phone=%s insets the card %s and sizes the mark', (phone, inset, other, mark) => {
	const { container } = render(
		<DeviceScope phone={phone}>
			<GateScreen tone="warn" title="Title" />
		</DeviceScope>
	);
	expect(card()).toHaveClass(inset, 'w-full', 'max-w-md');
	expect(card()).not.toHaveClass(other);
	expect(container.querySelector('[data-logo]')).toHaveAttribute('data-logo', mark);
});
