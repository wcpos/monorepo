import * as React from 'react';

export type DialogLabels = { close: string; cancel: string };

const DialogLabelsContext = React.createContext<DialogLabels>({ close: 'Close', cancel: 'Cancel' });

export function DialogLabelsProvider({
	labels,
	children,
}: React.PropsWithChildren<{ labels: DialogLabels }>) {
	return <DialogLabelsContext.Provider value={labels}>{children}</DialogLabelsContext.Provider>;
}

export function useDialogLabels(): DialogLabels {
	return React.useContext(DialogLabelsContext);
}

const DismissIsCloseContext = React.createContext(false);
/**
 * A form that saves as it is edited has nothing to cancel, so its footer's dismiss reads Close
 * even beside an intent (Sync order, Re-open). The record shell renders this; a call site never does.
 */
export function DismissIsClose({ children }: React.PropsWithChildren): React.JSX.Element {
	return <DismissIsCloseContext.Provider value={true}>{children}</DismissIsCloseContext.Provider>;
}
export function useDismissIsClose(): boolean {
	return React.useContext(DismissIsCloseContext);
}
