import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { MinTargetBand } from './min-target';

// react-native-web drops `className` from a View; a plain div keeps it for the assertions.
jest.mock('react-native', () => ({
	View: ({
		children,
		className,
		testID,
		pointerEvents,
	}: React.PropsWithChildren<{ className?: string; testID?: string; pointerEvents?: string }>) => (
		<div data-testid={testID} className={className} data-pointer-events={pointerEvents}>
			{children}
		</div>
	),
}));

it('is a control-token band centred over the control, out of layout, tall only', () => {
	render(<MinTargetBand />);
	const band = screen.getByTestId('min-target-band');
	expect(band).toHaveClass('absolute', 'inset-0', 'items-center', 'justify-center');
	expect(band).toHaveAttribute('data-pointer-events', 'box-none');
	expect(band.firstElementChild).toHaveClass('min-h-ctl', 'w-full');
	expect(band.firstElementChild).not.toHaveClass('min-w-ctl');
});

it('grows a lone small control to 44 × 44 when square', () => {
	render(<MinTargetBand square />);
	expect(screen.getByTestId('min-target-band').firstElementChild).toHaveClass(
		'min-h-ctl',
		'min-w-ctl'
	);
});
