import type {
	CaptureMode,
	CaptureModeEntry,
	PaymentHardware,
	PaymentMethodDescriptor,
} from './types';

/** The `server` hardware block: the store's cloud readers and its default. */
export type ServerHardware = Extract<PaymentHardware, { readers: unknown }>;

/**
 * The reader connection the store allows for `mode` (contract 1.3 `capture.modes`), or `null`.
 * An older store sends no `modes`: its one connection is the top-level `capture`.
 */
export function captureEntry(
	method: PaymentMethodDescriptor | null | undefined,
	mode: CaptureMode
): CaptureModeEntry | null {
	if (!method) return null;
	const { capture } = method;
	if (capture.modes?.length) return capture.modes.find((entry) => entry.mode === mode) ?? null;
	return capture.mode === mode
		? { mode: capture.mode, provider: capture.provider, hardware: capture.hardware }
		: null;
}

/** The cloud readers the store allows this method to pay with, or `null` when it allows none. */
export function serverHardware(
	method: PaymentMethodDescriptor | null | undefined
): ServerHardware | null {
	const hardware = captureEntry(method, 'server')?.hardware;
	return hardware && 'readers' in hardware ? hardware : null;
}
