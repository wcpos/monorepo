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
