import * as React from 'react';

export type DialogLabels = { close: string };

const DialogLabelsContext = React.createContext<DialogLabels>({ close: 'Close' });

export function DialogLabelsProvider({
	labels,
	children,
}: React.PropsWithChildren<{ labels: DialogLabels }>) {
	return <DialogLabelsContext.Provider value={labels}>{children}</DialogLabelsContext.Provider>;
}

export function useDialogLabels(): DialogLabels {
	return React.useContext(DialogLabelsContext);
}
