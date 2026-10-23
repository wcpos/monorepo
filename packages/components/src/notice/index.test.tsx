import { readFileSync } from 'node:fs';

import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { openExternalURL } from '@wcpos/utils/open-external-url';

import { Notice } from './index';

// Uniwind is not compiled in Jest; expose root classes, retaining real web pressables.
jest.mock('react-native', () => ({
	...jest.requireActual('react-native'),
	View: ({ testID, dataSet, ...props }: { testID?: string; dataSet?: { kind?: string } }) =>
		React.createElement('div', { ...props, 'data-testid': testID, 'data-kind': dataSet?.kind }),
}));
jest.mock('@rn-primitives/slot', () => ({ Slot: 'span' }));
jest.mock('expo-haptics', () => ({
	impactAsync: jest.fn(),
	ImpactFeedbackStyle: { Light: 'light' },
}));
// SVG/native animation runtimes are outside these composition tests.
jest.mock('../icon', () => ({
	Icon: ({ name }: { name: string }) => React.createElement('span', { 'data-icon': name }),
}));
jest.mock('../loader', () => ({ Loader: () => null }));
jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));

it.each([
	['warn', 'border-warn/45 bg-warn-bg', 'warning', 'status', 'polite'],
	['info', 'border-border bg-card', 'info', 'status', 'polite'],
	['bad', 'border-bad/45 bg-bad-bg', 'alert', 'alert', 'assertive'],
] as const)('renders the %s tone and live region', (tone, classes, icon, role, live) => {
	const { container } = render(<Notice tone={tone} title="Title" testID="notice" />);
	expect(screen.getByTestId('notice')).toHaveClass(...classes.split(' '));
	expect(screen.getByTestId('notice')).toHaveAttribute('role', role);
	expect(screen.getByTestId('notice')).toHaveAttribute('aria-live', live);
	expect(container.querySelector('[data-icon]')).toHaveAttribute('data-icon', icon);
});
it('renders two ordered actions and fires their own callbacks', () => {
	const first = jest.fn();
	const second = jest.fn();
	render(
		<Notice
			tone="bad"
			title="Title"
			description="Description"
			testID="notice"
			actions={[
				{ label: 'Reload', onPress: first },
				{ label: 'Status', onPress: second },
			]}
		/>
	);
	expect(screen.getByTestId('notice-title')).toHaveTextContent('Title');
	expect(screen.getByTestId('notice-description')).toHaveTextContent('Description');
	expect(screen.getAllByRole('button').map((button) => button.dataset.testid)).toEqual([
		'notice-action-0',
		'notice-action-1',
	]);
	fireEvent.click(screen.getByTestId('notice-action-0'));
	expect(first).toHaveBeenCalledTimes(1);
	expect(second).not.toHaveBeenCalled();
	fireEvent.click(screen.getByTestId('notice-action-1'));
	expect(second).toHaveBeenCalledTimes(1);
});
it('composes a real DocsLink', () => {
	render(
		<Notice
			tone="warn"
			title="Title"
			testID="notice"
			docs={{ label: 'Learn more', href: 'https://docs.wcpos.com' }}
		/>
	);
	fireEvent.click(screen.getByTestId('notice-docs'));
	expect(openExternalURL).toHaveBeenCalledWith('https://docs.wcpos.com');
});
it('renders children inside the text column under the description', () => {
	render(
		<Notice tone="warn" title="Title" description="Description" testID="notice">
			<span data-testid="body">Engine warning</span>
		</Notice>
	);
	const description = screen.getByTestId('notice-description');
	const body = screen.getByTestId('body');
	expect(screen.getByTestId('notice')).toContainElement(body);
	expect(description.nextElementSibling).toBe(body);
});
it('has no internal dismissal or timer', () => {
	expect(readFileSync(`${__dirname}/index.tsx`, 'utf8')).not.toMatch(/onDismiss|xmark|setTimeout/);
});

it('announces a bad notice on iOS, where aria-live has no native live region', () => {
	const { AccessibilityInfo, Platform } = jest.requireActual('react-native');
	const announce = jest
		.spyOn(AccessibilityInfo, 'announceForAccessibility')
		.mockImplementation(() => {});
	const os = jest.replaceProperty(Platform, 'OS', 'ios');
	render(<Notice tone="bad" title="Local database unavailable" />);
	expect(announce).toHaveBeenCalledWith('Local database unavailable');
	announce.mockClear();
	render(<Notice tone="warn" title="Offline" />);
	expect(announce).not.toHaveBeenCalled();
	os.restore();
	announce.mockRestore();
});
it('renders each item as its line with its own actions, in the band action styling', () => {
	const open = jest.fn();
	const handled = jest.fn();
	render(
		<Notice
			tone="bad"
			title="2 sales need attention"
			testID="notice"
			items={[
				{
					id: 'a',
					text: 'Order #1 was already paid online.',
					actions: [
						{ label: 'Open order', onPress: open, testID: 'open-a' },
						{ label: 'Handled', onPress: handled },
					],
				},
				{
					id: 'b',
					text: 'Order #2 could not accept the payment.',
					actions: [{ label: 'Handled', onPress: handled }],
				},
			]}
		/>
	);
	expect(screen.getByTestId('notice-row-a')).toHaveTextContent('Order #1 was already paid online.');
	expect(screen.getByTestId('notice-row-b')).toHaveTextContent(
		'Order #2 could not accept the payment.'
	);
	// An action's own testID wins; otherwise it is named after its row.
	fireEvent.click(screen.getByTestId('open-a'));
	fireEvent.click(screen.getByTestId('notice-row-b-action-0'));
	expect(open).toHaveBeenCalledTimes(1);
	expect(handled).toHaveBeenCalledTimes(1);
	expect(screen.queryByTestId('notice-action-0')).toBeNull();
	// One action style for the band and its items (Uniwind classes are not compiled here).
	expect(readFileSync(`${__dirname}/index.tsx`, 'utf8').match(/min-h-9/g)).toHaveLength(1);
});
