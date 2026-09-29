import * as React from 'react';

const CashierSheetContext = React.createContext<{
	open: boolean;
	setOpen: (open: boolean) => void;
} | null>(null);

export function CashierSheetProvider({
	children,
	initialOpen,
}: {
	children: React.ReactNode;
	initialOpen: () => boolean;
}) {
	const [open, setOpen] = React.useState(initialOpen);
	return React.createElement(CashierSheetContext.Provider, { value: { open, setOpen } }, children);
}

export function useCashierSheet() {
	return React.useContext(CashierSheetContext)!;
}
