import { readFileSync } from 'node:fs';

import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { mockPhone, mockRoot } from './sheet.test-utils';
import { TextClassContext } from '../text';
import * as C from './index';
jest.mock('@rn-primitives/dropdown-menu', () =>
	jest.requireActual('./sheet.test-utils').mockPrimitive()
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

it('keeps one scrim component identity across renders', () => {
	// A scrim created per render (useMemo on the caller's overlay props) would remount the
	// menu on web whenever an inline overlayStyle changed identity (CodeRabbit on #2212).
	const source = readFileSync(`${__dirname}/index.tsx`, 'utf8');
	expect(source).toMatch(/^function MenuScrim\(/m);
	expect(source).toMatch(/Scrim=\{MenuScrim\}/);
	expect(source).not.toMatch(/useMemo\(\(\) => \{\s*function/);
});

// Missing sheet branches, close calls, and selection conditions must fail these contracts.
describe('phone sheet', () => {
	beforeEach(() => {
		mockPhone.current = true;
		mockRoot.open = true;
		jest.clearAllMocks();
	});
	afterEach(() => {
		mockPhone.current = false;
	});
	it('closes after press and preserves stay-open and disabled rows', () => {
		const action = jest.fn();
		render(
			<C.DropdownMenuContent inline testID="panel">
				<C.DropdownMenuItem testID="action" onPress={action}>
					Action
				</C.DropdownMenuItem>
				<C.DropdownMenuItem testID="stay" closeOnPress={false}>
					Stay
				</C.DropdownMenuItem>
				<C.DropdownMenuItem testID="disabled" disabled onPress={action}>
					Disabled
				</C.DropdownMenuItem>
			</C.DropdownMenuContent>
		);
		expect(screen.getAllByRole('dialog')).toHaveLength(1);
		expect(document.querySelector('[data-primitive]')).toBeNull();
		expect(screen.getByTestId('action')).toHaveAttribute('role', 'menuitem');
		expect(screen.getByTestId('action')).toHaveClass('min-h-row');
		expect(screen.getByTestId('action').className).not.toMatch(/web:hover:|web:focus:/);
		fireEvent.click(screen.getByTestId('action'));
		expect(action).toHaveBeenCalledTimes(1);
		expect(mockRoot.onOpenChange).toHaveBeenCalledWith(false);
		expect(action.mock.invocationCallOrder[0]).toBeLessThan(
			mockRoot.onOpenChange.mock.invocationCallOrder[0]
		);
		mockRoot.onOpenChange.mockClear();
		fireEvent.click(screen.getByTestId('stay'));
		fireEvent.click(screen.getByTestId('disabled'));
		expect(mockRoot.onOpenChange).not.toHaveBeenCalled();
		expect(action).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId('disabled')).toHaveClass('opacity-45');
		fireEvent.click(screen.getByTestId('panel-scrim'));
		expect(mockRoot.onOpenChange).toHaveBeenCalledWith(false);
	});
	it('toggles checkbox and renders the selected radio dot', () => {
		const checked = jest.fn(),
			selected = jest.fn(),
			pressed = jest.fn();
		render(
			<C.DropdownMenuContent inline>
				<C.DropdownMenuCheckboxItem
					testID="checkbox"
					checked={false}
					onCheckedChange={checked}
					onPress={pressed}
				>
					Check
				</C.DropdownMenuCheckboxItem>
				<C.DropdownMenuRadioGroup value="b" onValueChange={selected}>
					<C.DropdownMenuRadioItem testID="a" value="a" onPress={pressed}>
						A
					</C.DropdownMenuRadioItem>
					<C.DropdownMenuRadioItem testID="b" value="b">
						B
					</C.DropdownMenuRadioItem>
				</C.DropdownMenuRadioGroup>
			</C.DropdownMenuContent>
		);
		expect(document.querySelector('[data-primitive]')).toBeNull();
		// The rows sit in a menu container; the check mark is presentational, not a nested control.
		expect(screen.getByRole('menu')).toBeInTheDocument();
		expect(screen.getByTestId('checkbox')).toHaveAttribute('role', 'menuitemcheckbox');
		expect(screen.getByTestId('checkbox').querySelector('[role]')).toBeNull();
		expect(screen.getByTestId('checkbox').querySelector('[data-icon="check"]')).toBeNull();
		expect(screen.getByTestId('a')).toHaveAttribute('role', 'menuitemradio');
		expect(screen.getByTestId('a').querySelector('.bg-primary')).toBeNull();
		expect(screen.getByTestId('b').querySelector('.bg-primary')).not.toBeNull();
		expect(screen.getByTestId('b')).toHaveAttribute('aria-checked', 'true');
		fireEvent.click(screen.getByTestId('checkbox'));
		expect(checked).toHaveBeenCalledWith(true);
		fireEvent.click(screen.getByTestId('a'));
		expect(selected).toHaveBeenCalledWith('a');
		// The caller's own press handler runs on both row kinds, before the update and the close.
		expect(pressed).toHaveBeenCalledTimes(2);
		expect(pressed.mock.invocationCallOrder[0]).toBeLessThan(checked.mock.invocationCallOrder[0]);
		expect(mockRoot.onOpenChange.mock.calls).toEqual([[false], [false]]);
	});
	it('flattens submenus and keeps label, separator and hint styling', () => {
		render(
			<C.DropdownMenuContent inline>
				<C.DropdownMenuSub>
					<C.DropdownMenuSubTrigger testID="section">Section</C.DropdownMenuSubTrigger>
					<C.DropdownMenuSubContent>
						<C.DropdownMenuItem testID="nested">
							Nested<C.DropdownMenuShortcut testID="hint">Hint</C.DropdownMenuShortcut>
						</C.DropdownMenuItem>
					</C.DropdownMenuSubContent>
				</C.DropdownMenuSub>
				<C.DropdownMenuSeparator testID="separator" />
			</C.DropdownMenuContent>
		);
		expect(document.querySelector('[data-primitive]')).toBeNull();
		expect(screen.getByTestId('section')).toHaveTextContent('Section');
		expect(screen.getByTestId('section').querySelector('.uppercase')).not.toBeNull();
		// The label reads at the floor (text-sm), not below it (the design rule; Codex on #2215).
		expect(screen.getByTestId('section').querySelector('.text-sm')).not.toBeNull();
		expect(screen.getByTestId('section').querySelector('.text-xs')).toBeNull();
		expect(screen.getByTestId('nested')).toHaveAttribute('role', 'menuitem');
		expect(screen.getByTestId('hint')).toHaveClass('ml-auto');
		expect(screen.getByTestId('separator')).toHaveClass('-mx-2');
		expect(document.querySelector('[data-icon="chevronRight"]')).toBeNull();
	});
	it('renders nothing for a closed inline sheet', () => {
		mockRoot.open = false;
		const { container } = render(<C.DropdownMenuContent inline />);
		expect(container).toBeEmptyDOMElement();
	});
});
