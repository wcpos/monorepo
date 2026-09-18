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
	['warn', 'border-warn/45 bg-warn-bg', 'triangleExclamation', 'status', 'polite'],
	['info', 'border-border bg-card', 'circleInfo', 'status', 'polite'],
	['bad', 'border-bad/45 bg-bad-bg', 'circleExclamation', 'alert', 'assertive'],
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
it('has no internal dismissal or timer', () => {
	expect(readFileSync(`${__dirname}/index.tsx`, 'utf8')).not.toMatch(/onDismiss|xmark|setTimeout/);
});
