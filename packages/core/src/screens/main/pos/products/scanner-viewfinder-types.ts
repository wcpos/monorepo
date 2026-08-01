import type { CameraScanResult } from './use-camera-scan';

/**
 * Lifecycle states the viewfinder reports to the panel chrome. Every failure
 * mode has a state — decode problems must surface in the UI, never vanish
 * (issue #905: expo-camera's web loop swallowed every decode error).
 */
export type ViewfinderStatus =
	'initializing' | 'scanning' | 'camera-denied' | 'camera-unavailable' | 'decoder-error';

export interface ScannerViewfinderProps {
	onScan: (result: CameraScanResult) => void;
	onStatusChange?: (status: ViewfinderStatus) => void;
}
