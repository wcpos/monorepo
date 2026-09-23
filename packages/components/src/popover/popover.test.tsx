import '../popover/overlay.test-utils';
import { readFileSync } from 'node:fs';

import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { DeviceScope } from '../lib/device';
import * as C from './index';
jest.mock('@rn-primitives/popover', () =>
	jest.requireActual('../popover/overlay.test-utils').mockPrimitive()
);

it('renders the anchored panel skin', () => {
	render(<C.PopoverContent inline testID="panel" />);
	expect(screen.getByTestId('panel')).toHaveClass('bg-card rounded-lg w-80 web:animate-pop-in');
	expect(readFileSync(`${__dirname}/index.tsx`, 'utf8')).not.toMatch(/Platform|bg-popover/);
});
it('uses a sheet View, not positioned primitive content, on phones', () => {
	render(
		<DeviceScope phone>
			<C.PopoverContent inline testID="panel" />
		</DeviceScope>
	);
	expect(screen.getByTestId('panel')).toHaveClass('rounded-t-2xl');
	expect(screen.queryByTestId('primitive-content')).toBeNull();
	expect(screen.getByTestId('panel-scrim')).toHaveClass('bg-scrim');
	// The sheet rises like the dialog's, and the web scrim closes it: the primitive's web
	// Overlay is a bare Pressable and no Radix Content is mounted to own outside-click.
	expect(screen.getByTestId('panel')).toHaveClass('web:animate-sheet-in');
	fireEvent.click(screen.getByTestId('panel-scrim'));
	const { useRootContext } = jest.requireMock('@rn-primitives/popover');
	expect(useRootContext().onOpenChange).toHaveBeenCalledWith(false);
});

it('lets the sheet geometry win over an anchored caller width', () => {
	render(
		<DeviceScope phone>
			<C.PopoverContent inline testID="panel" className="w-80" />
		</DeviceScope>
	);
	expect(screen.getByTestId('panel')).toHaveClass('w-full');
	expect(screen.getByTestId('panel')).not.toHaveClass('w-80');
});
