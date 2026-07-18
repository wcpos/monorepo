import * as React from 'react';

import { EMPTY, type Observable } from 'rxjs';

import { createScanBus, type ScanBus, type ScanEvent } from '@wcpos/scanner';

interface DeviceScanContextValue {
	events$: Observable<ScanEvent>;
	emit: ScanBus['emit'];
}

// Default: no direct-connection source wired. `events$` is EMPTY so merging it
// is a no-op, letting useBarcodeDetection run without a provider (e.g. the
// settings test panel) — only the POS products screen provides a live bus.
const noopContext: DeviceScanContextValue = {
	events$: EMPTY,
	emit: () => undefined,
};

const DeviceScanContext = React.createContext<DeviceScanContextValue>(noopContext);

/**
 * A single scan bus shared between the direct-connection sources (Web Serial /
 * WebHID scanners, which emit decoded barcodes) and useBarcodeDetection (which
 * merges them into scanEvents$). Consumer-scoped, not global — the camera has
 * its own equivalent bus.
 */
export function DeviceScanProvider({ children }: { children: React.ReactNode }) {
	// Lazy state initializer keeps a single bus for the provider's lifetime
	// without writing a ref during render.
	const [bus] = React.useState(() => createScanBus());
	const value = React.useMemo<DeviceScanContextValue>(
		() => ({ events$: bus.events$, emit: bus.emit }),
		[bus]
	);
	return <DeviceScanContext.Provider value={value}>{children}</DeviceScanContext.Provider>;
}

export function useDeviceScanBus(): DeviceScanContextValue {
	return React.useContext(DeviceScanContext);
}
