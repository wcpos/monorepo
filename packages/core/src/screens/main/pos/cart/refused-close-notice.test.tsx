/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { RefusedCloseNotice } from './refused-close-notice';

jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/components/notice', () => ({
	Notice: ({
		description,
		actions,
	}: {
		description?: string;
		actions?: { label: string; testID: string; onPress: () => void }[];
	}) => (
		<>
			{description && <p data-testid="description">{description}</p>}
			{actions?.map(({ label, testID, onPress }) => (
				<button key={testID} data-testid={testID} onClick={onPress}>
					{label}
				</button>
			))}
		</>
	),
}));

it('offers Retry only when given one', () => {
	const onRetry = jest.fn();
	const view = render(<RefusedCloseNotice />);
	expect(screen.queryByTestId('register-panel-retry-close')).toBeNull();
	view.rerender(<RefusedCloseNotice onRetry={onRetry} />);
	fireEvent.click(screen.getByTestId('register-panel-retry-close'));
	expect(screen.getByTestId('register-panel-retry-close').textContent).toBe('register.retry');
	expect(onRetry).toHaveBeenCalledTimes(1);
});

it('is the one line, with no description under it', () => {
	render(<RefusedCloseNotice onRetry={jest.fn()} />);
	expect(screen.queryByTestId('description')).toBeNull();
});
