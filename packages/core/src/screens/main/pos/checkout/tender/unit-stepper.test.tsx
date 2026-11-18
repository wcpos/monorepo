/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { UnitStepper } from './unit-stepper';

jest.mock('@wcpos/components/text', () => ({
	Text: ({
		children,
		testID,
		numberOfLines,
	}: React.PropsWithChildren<{ testID?: string; numberOfLines?: number }>) => (
		<span data-testid={testID} data-lines={numberOfLines}>
			{children}
		</span>
	),
}));

jest.mock('@wcpos/components/icon-button', () => ({ IconButton: () => null }));

jest.mock('../../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../../jest/translate').createTestT(),
}));

it('the count n of m stays on one line', () => {
	render(<UnitStepper picked={0} unpaid={1} onChange={jest.fn()} testIDBase="checkout-line-a" />);
	expect(screen.getByTestId('checkout-line-a-units').getAttribute('data-lines')).toBe('1');
});
