export type SentryCaptureInput = {
	message: string;
	code?: number | string;
	context?: unknown;
};

export type TelemetryConsent = 'undecided' | 'allowed' | 'denied';

export function setTelemetryConsent(_consent: TelemetryConsent): void {}

export function captureLoggedError(_input: SentryCaptureInput): void {}

export function capturePrinterOutcome(
	_context: Record<string, string | number | boolean | undefined>
): void {}
