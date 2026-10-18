/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { HelpSheet } from './help-sheet';
import { COMMAND_IDS } from '../commands';

import type { CommandContext } from '../commands';

// The sheet takes its context as a prop; the provider and its router stay out of this suite.
jest.mock('../commands/provider', () => ({}));
jest.mock('@wcpos/components/dialog', () => {
	function Wrapper({ children, testID }: React.PropsWithChildren<{ testID?: string }>) {
		return <div data-testid={testID}>{children}</div>;
	}
	return {
		Dialog: ({ open, children }: React.PropsWithChildren<{ open: boolean }>) =>
			open ? <>{children}</> : null,
		DialogBody: Wrapper,
		DialogContent: Wrapper,
		DialogHeader: Wrapper,
		DialogTitle: Wrapper,
	};
});
jest.mock('../../screens/main/pos/contexts/overlay-side', () => ({
	usePanelSide: () => 'right',
}));
jest.mock('../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../jest/translate').createTestT(),
}));

const log = jest.fn();
function makeCtx(screen: Partial<CommandContext['screen']> = {}): CommandContext {
	return {
		log,
		focus: jest.fn(async () => undefined),
		hasSurface: () => true,
		screen: { route: 'cart', hasOpenOrder: true, openOrderCount: 2, lineCount: 1, ...screen },
	} as unknown as CommandContext;
}

beforeEach(() => jest.clearAllMocks());

it('lists the eight commands with their chords', () => {
	render(<HelpSheet open onOpenChange={jest.fn()} ctx={makeCtx()} />);
	expect(screen.getByTestId('hotkeys-help-sheet').textContent).toContain('Keyboard shortcuts');
	for (const id of COMMAND_IDS) expect(screen.getByTestId(`hotkeys-help-row-${id}`)).toBeTruthy();
	expect(screen.getByTestId('hotkeys-help-row-pos.search.focus').textContent).toBe(
		'Search productsAltF'
	);
	expect(screen.getByTestId('hotkeys-help-row-pos.cart.previous').textContent).toBe(
		'Previous cartAlt←'
	);
	expect(screen.getByTestId('hotkeys-help-row-pos.help.open').textContent).toBe(
		'Keyboard shortcutsAlt/'
	);
	expect(screen.getByText(/Alt\+F and Alt\+D may also open the Firefox menu/)).toBeTruthy();
});

it('greys the commands that are not available', () => {
	const onOpenChange = jest.fn();
	render(<HelpSheet open onOpenChange={onOpenChange} ctx={makeCtx({ lineCount: 0 })} />);
	const pay = screen.getByTestId('hotkeys-help-row-pos.checkout.open');
	expect(pay.getAttribute('aria-disabled')).toBe('true');
	fireEvent.click(pay);
	expect(onOpenChange).not.toHaveBeenCalled();
	const search = screen.getByTestId('hotkeys-help-row-pos.search.focus');
	expect(search.getAttribute('aria-disabled')).not.toBe('true');
});

it('a row press closes the sheet and runs its command with source ui', async () => {
	jest.useFakeTimers();
	try {
		const onOpenChange = jest.fn();
		const ctx = makeCtx();
		render(<HelpSheet open onOpenChange={onOpenChange} ctx={ctx} />);
		fireEvent.click(screen.getByTestId('hotkeys-help-row-pos.search.focus'));
		expect(onOpenChange).toHaveBeenCalledWith(false);
		// The command runs once the close has committed, not inside the open sheet.
		expect(ctx.focus).not.toHaveBeenCalled();
		await act(async () => {
			jest.runAllTimers();
		});
		expect(ctx.focus).toHaveBeenCalledWith('search');
		expect(log).toHaveBeenCalledWith('debug', 'Command ran', {
			category: ['wcpos', 'pos', 'commands'],
			context: { type: 'command.run', command: 'pos.search.focus', source: 'ui' },
		});
	} finally {
		jest.useRealTimers();
	}
});

it('renders no rows while closed', () => {
	render(<HelpSheet open={false} onOpenChange={jest.fn()} ctx={makeCtx()} />);
	expect(screen.queryByTestId('hotkeys-help-sheet')).toBeNull();
});

jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
