import '../popover/overlay.test-utils';
import { readFileSync } from 'node:fs';

import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { TextClassContext } from '../text';
import * as C from './index';
jest.mock('@rn-primitives/dropdown-menu', () =>
	jest.requireActual('../popover/overlay.test-utils').mockPrimitive()
);

it('renders the anchored panel skin', () => {
	render(<C.DropdownMenuContent inline testID="panel" />);
	expect(screen.getByTestId('panel')).toHaveClass(
		'bg-card rounded-lg min-w-50 p-1.5 web:animate-pop-in'
	);
	expect(readFileSync(`${__dirname}/index.tsx`, 'utf8')).not.toMatch(/Platform|bg-popover/);
});
it('keeps destructive text red on an ordinary muted row', () => {
	function Label() {
		return <span data-testid="label" className={React.useContext(TextClassContext)} />;
	}
	render(
		<C.DropdownMenuItem variant="destructive" testID="row">
			<Label />
			<C.DropdownMenuShortcut testID="shortcut">⌘P</C.DropdownMenuShortcut>
		</C.DropdownMenuItem>
	);
	expect(screen.getByTestId('row')).toHaveClass('min-h-row rounded-md');
	expect(screen.getByTestId('row').className).not.toContain('bg-destructive');
	expect(screen.getByTestId('label')).toHaveClass('text-destructive');
	expect(screen.getByTestId('shortcut')).toHaveClass('text-muted-foreground text-sm');
	for (const file of ['index.tsx', 'item.tsx'])
		expect(readFileSync(`${__dirname}/${file}`, 'utf8')).not.toMatch(/group|Platform|accent/);
});
