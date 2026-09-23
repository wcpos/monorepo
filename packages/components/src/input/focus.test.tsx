import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { Input } from './index';

let box: Record<string, unknown>;
jest.mock('react-native', () => {
	const actual = jest.requireActual('react-native');
	return {
		...actual,
		View: (props: Record<string, unknown>) => {
			box = props;
			return <div>{props.children as React.ReactNode}</div>;
		},
	};
});
jest.mock(
	'@wcpos/hooks/use-merged-ref',
	() => ({ useMergedRef: (...refs: unknown[]) => refs.find((ref) => ref !== null) }),
	{ virtual: true }
);
jest.mock('../icon-button', () => ({ IconButton: () => null }));
it('lights the border and one-pixel ring only while focused', () => {
	const { rerender } = render(<Input testID="field" />);
	expect(box.className).toContain('bg-card');
	expect(box.className).not.toContain('border-ring');
	fireEvent.focus(screen.getByTestId('field'));
	expect(box.className).toContain('border-ring web:ring-1 web:ring-ring');
	fireEvent.blur(screen.getByTestId('field'));
	expect(box.className).not.toContain('border-ring');
	rerender(<Input disabled />);
	expect(box.className).toContain('opacity-45');
});
