/** @jest-environment jsdom */
import * as React from 'react';

import { FocusScope } from '@radix-ui/react-focus-scope';
import { act, render, screen } from '@testing-library/react';

import { SheetFocusScope } from './sheet-focus-scope.web';

// A modal dialog's trapped scope, and a phone sheet portalled beside it (a form's keypad).
function Dialog({ sheet, scoped }: { sheet: boolean; scoped: boolean }) {
	const panel = (
		<div>
			<button data-testid="key">1</button>
		</div>
	);
	return (
		<>
			<FocusScope trapped>
				<button data-testid="field">Amount</button>
			</FocusScope>
			{sheet && (scoped ? <SheetFocusScope>{panel}</SheetFocusScope> : panel)}
		</>
	);
}

it.each([
	[true, 'key'],
	[false, 'field'],
])('a sheet over a modal dialog keeps its focus: scoped %s, focus on %s', (scoped, holder) => {
	const { rerender } = render(<Dialog sheet={false} scoped={scoped} />);
	act(() => screen.getByTestId('field').focus());
	rerender(<Dialog sheet scoped={scoped} />);
	act(() => screen.getByTestId('key').focus());
	expect(document.activeElement).toBe(screen.getByTestId(holder));
});

it('moves no focus itself as the sheet opens', () => {
	const { rerender } = render(<Dialog sheet={false} scoped />);
	act(() => screen.getByTestId('field').focus());
	rerender(<Dialog sheet scoped />);
	expect(document.activeElement).toBe(screen.getByTestId('field'));
});
