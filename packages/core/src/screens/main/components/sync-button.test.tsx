/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render } from '@testing-library/react';

import { SyncButton } from './sync-button';

const mockTooltip = jest.fn();

jest.mock('@wcpos/components/dropdown-menu', () => ({
	DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	DropdownMenuItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	DropdownMenuSeparator: () => null,
	DropdownMenuTrigger: () => null,
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/icon-button', () => ({ IconButton: () => null }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@wcpos/components/tooltip', () => ({
	Tooltip: ({ children, ...props }: { children: React.ReactNode; showOnNative?: boolean }) => {
		mockTooltip(props);
		return <>{children}</>;
	},
	TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

it('renders sync guidance on native', () => {
	render(<SyncButton sync={jest.fn()} active={false} />);

	expect(mockTooltip).toHaveBeenCalledWith(expect.objectContaining({ showOnNative: true }));
});
