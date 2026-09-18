import { readFileSync } from 'node:fs';

import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { openExternalURL } from '@wcpos/utils/open-external-url';

import { EmptyState } from './index';

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
	['empty', 'circleInfo'],
	['no-results', 'magnifyingGlass'],
	['failed', 'triangleExclamation'],
] as const)('uses the %s icon and kind attribute', (kind, icon) => {
	const { container } = render(<EmptyState kind={kind} title="Title" testID="state" />);
	expect(container.querySelector('[data-icon]')).toHaveAttribute('data-icon', icon);
	expect(screen.getByTestId('state')).toHaveAttribute('data-kind', kind);
});
it('lets a custom icon win', () => {
	const { container } = render(<EmptyState kind="empty" icon="circleExclamation" title="Title" />);
	expect(container.querySelector('[data-icon]')).toHaveAttribute('data-icon', 'circleExclamation');
});
it('composes title, description, action and real DocsLink with derived IDs', () => {
	const onPress = jest.fn();
	render(
		<EmptyState
			kind="failed"
			title="Title"
			description="Description"
			testID="state"
			action={{ label: 'Retry', onPress }}
			docs={{ label: 'Help', href: 'https://docs.wcpos.com' }}
		/>
	);
	expect(screen.getByTestId('state-title')).toHaveTextContent('Title');
	expect(screen.getByTestId('state-description')).toHaveTextContent('Description');
	fireEvent.click(screen.getByTestId('state-action'));
	expect(onPress).toHaveBeenCalledTimes(1);
	fireEvent.click(screen.getByTestId('state-docs'));
	expect(openExternalURL).toHaveBeenCalledWith('https://docs.wcpos.com');
});
it('inline omits both icon and description, but keeps action and docs', () => {
	const { container } = render(
		<EmptyState
			kind="failed"
			size="inline"
			title="Title"
			description="Description"
			testID="state"
			action={{ label: 'Retry', onPress: jest.fn() }}
			docs={{ label: 'Help', href: 'https://docs.wcpos.com' }}
		/>
	);
	expect(container.querySelector('[data-icon="triangleExclamation"]')).toBeNull();
	expect(screen.queryByTestId('state-description')).toBeNull();
	expect(screen.getByTestId('state-action')).toBeInTheDocument();
	expect(screen.getByTestId('state-docs')).toBeInTheDocument();
});
it('focuses the real action ref on mount only, not on kind changes', () => {
	const focus = jest.spyOn(HTMLElement.prototype, 'focus');
	const action = { label: 'Retry', onPress: jest.fn() };
	const { rerender } = render(
		<EmptyState kind="empty" title="Title" testID="state" action={action} autoFocus />
	);
	expect(screen.getByTestId('state-action')).toHaveFocus();
	expect(focus).toHaveBeenCalledTimes(1);
	rerender(<EmptyState kind="failed" title="Title" testID="state" action={action} autoFocus />);
	expect(focus).toHaveBeenCalledTimes(1);
	focus.mockRestore();
});
it('does not focus without an action or without opt-in', () => {
	const focus = jest.spyOn(HTMLElement.prototype, 'focus');
	const { rerender } = render(<EmptyState kind="empty" title="Title" autoFocus />);
	rerender(
		<EmptyState kind="empty" title="Title" action={{ label: 'Retry', onPress: jest.fn() }} />
	);
	expect(focus).not.toHaveBeenCalled();
	focus.mockRestore();
});
it('preserves explicit action and docs IDs without a root ID', () => {
	render(
		<EmptyState
			kind="empty"
			title="Title"
			action={{ label: 'Retry', onPress: jest.fn(), testID: 'retry' }}
			docs={{ label: 'Help', href: 'https://docs.wcpos.com', testID: 'help' }}
		/>
	);
	expect(screen.getByTestId('retry')).toBeInTheDocument();
	expect(screen.getByTestId('help')).toBeInTheDocument();
	expect(screen.queryByTestId('undefined-title')).toBeNull();
});
it('does not truncate', () => {
	expect(readFileSync(`${__dirname}/index.tsx`, 'utf8')).not.toContain('numberOfLines');
});
