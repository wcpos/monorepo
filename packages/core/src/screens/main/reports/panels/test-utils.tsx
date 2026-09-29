import * as React from 'react';

import { render } from '@testing-library/react';

import { mockState } from '../cards/test-utils';
import { Reports } from '../reports';
import { calculateTotals } from '../report/utils';

import type * as Context from '../context';

// Native portal/animation primitives are not transformed by this Jest preset; keep shell state real.
jest.mock('@wcpos/components/portal', () => ({ PortalHost: () => null }));
jest.mock('@wcpos/components/dialog', () => {
	const Close = React.createContext(() => {});
	return {
		DialogTitle: ({ children }: React.PropsWithChildren) => <div role="heading">{children}</div>,
		Dialog: ({
			children,
			onOpenChange,
		}: React.PropsWithChildren<{ onOpenChange: (open: boolean) => void }>) => (
			<Close.Provider value={() => onOpenChange(false)}>{children}</Close.Provider>
		),
		DialogContent: ({
			children,
			closeButtonProps,
			side,
			portalHost,
		}: React.PropsWithChildren<{
			closeButtonProps: { testID: string };
			side: string;
			portalHost: string;
		}>) => (
			<div data-testid="dialog-shell" data-side={side} data-host={portalHost}>
				{children}
				<button data-testid={closeButtonProps.testID} onClick={React.useContext(Close)} />
			</div>
		),
	};
});
jest.mock('@wcpos/components/table', () => {
	const tags = {
		Table: 'table',
		TableHeader: 'thead',
		TableHead: 'th',
		TableBody: 'tbody',
		TableRow: 'tr',
		TableCell: 'td',
		TableFooter: 'tfoot',
	};
	return Object.fromEntries(
		Object.entries(tags).map(([name, tag]) => [
			name,
			({
				children,
				testID,
				className,
			}: React.PropsWithChildren<{ testID?: string; className?: string }>) =>
				React.createElement(tag, { 'data-testid': testID, className }, children),
		])
	);
});
jest.mock('../closures/save-or-share-csv', () => ({ saveOrShareCsv: jest.fn(async () => {}) }));
jest.mock('../hero', () => ({ Hero: () => <div data-testid="hero-total">Hero</div> }));
jest.mock('../sync-progress', () => ({ ReportsSyncProgress: () => null }));
jest.mock('../../../../services/register/use-register-binding', () => ({
	useRegisterBinding: () => ({ registerId: 'r', registerName: 'Front' }),
}));

// Only native controls are replaced; selection and report aggregation stay real.
jest.mock('@wcpos/components/checkbox', () => ({
	Checkbox: ({
		testID,
		checked,
		indeterminate,
		onCheckedChange,
		accessibilityLabel,
	}: {
		testID: string;
		checked: boolean;
		indeterminate?: boolean;
		onCheckedChange: (checked: boolean) => void;
		accessibilityLabel?: string;
	}) => (
		<button
			role="checkbox"
			aria-label={accessibilityLabel}
			aria-checked={indeterminate ? 'mixed' : checked}
			data-testid={testID}
			onClick={() => onCheckedChange(!checked)}
		/>
	),
}));
jest.mock('@wcpos/components/select', () => ({
	Select: ({ children }: React.PropsWithChildren) => children,
	SelectContent: ({ children }: React.PropsWithChildren) => children,
	SelectGroup: ({ children }: React.PropsWithChildren) => children,
	SelectTrigger: ({ children }: React.PropsWithChildren) => children,
	SelectValue: () => null,
	SelectItem: ({ label, testID }: { label: string; testID: string }) => (
		<span data-testid={testID}>{label}</span>
	),
}));
const Selection = React.createContext<Context.ReportsSelection | undefined>(undefined);
const context = jest.requireMock<typeof Context>('../context');
export const real = jest.requireActual<typeof Context>('../context');
export function preparePanel() {
	jest.spyOn(context, 'useReportsScope').mockImplementation(real.useReportsScope);
	jest.spyOn(context, 'useReportsSelection').mockImplementation(() => React.useContext(Selection)!);
	jest.spyOn(context, 'useReportsData').mockImplementation(() => {
		const included = real.useIncludedStatus();
		const { unselectedRowIds } = React.useContext(Selection)!;
		const selectedOrders = mockState.data.allOrders.filter(
			(order) => included(order) && !unselectedRowIds[order.uuid]
		);
		return {
			...mockState.data,
			selectedOrders,
			totals: calculateTotals({ orders: selectedOrders }),
		};
	});
}
function SelectionProvider({ children }: React.PropsWithChildren) {
	const [unselectedRowIds, setUnselectedRowIds] = React.useState<
		Context.ReportsSelection['unselectedRowIds']
	>({ hidden: true });
	const { statusMode, setStatusMode } = real.useReportsScope();
	return (
		<Selection.Provider value={{ unselectedRowIds, setUnselectedRowIds }}>
			<button
				data-testid="widen"
				onClick={() => setStatusMode(statusMode === 'all' ? 'done' : 'all')}
			/>
			<span data-testid="excluded">{JSON.stringify(unselectedRowIds)}</span>
			{children}
		</Selection.Provider>
	);
}
export const room = () =>
	render(
		<real.ReportsScopeProvider>
			<SelectionProvider>
				<Reports title="Sales" />
			</SelectionProvider>
		</real.ReportsScopeProvider>
	);
