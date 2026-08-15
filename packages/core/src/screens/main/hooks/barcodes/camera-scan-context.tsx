import * as React from 'react';

import { EMPTY, type Observable } from 'rxjs';

import { createScanBus, type ScanBus, type ScanEvent } from '@wcpos/scanner';

interface CameraScanContextValue {
	events$: Observable<ScanEvent>;
	emit: ScanBus['emit'];
}

// Default: no camera source wired. `events$` is EMPTY so merging it is a no-op,
// which lets useBarcodeDetection run without a provider (e.g. the settings
// test panel) — only the POS products screen provides a live bus.
const noopContext: CameraScanContextValue = {
	events$: EMPTY,
	emit: () => undefined,
};

const CameraScanContext = React.createContext<CameraScanContextValue>(noopContext);

/**
 * Provides a single scan bus shared between the camera viewfinder (which emits
 * decoded barcodes) and useBarcodeDetection (which merges them into
 * scanEvents$). Deliberately consumer-scoped, not global.
 */
export function CameraScanProvider({ children }: { children: React.ReactNode }) {
	// Lazy state initializer keeps a single bus for the provider's lifetime
	// without writing a ref during render.
	const [bus] = React.useState(() => createScanBus());
	const value = React.useMemo<CameraScanContextValue>(
		() => ({ events$: bus.events$, emit: bus.emit }),
		[bus]
	);
	return <CameraScanContext.Provider value={value}>{children}</CameraScanContext.Provider>;
}

export function useCameraScanBus(): CameraScanContextValue {
	return React.useContext(CameraScanContext);
}
