export type SentryCaptureInput = {
	message: string;
	code?: number | string;
	context?: unknown;
};

export function captureLoggedError(_input: SentryCaptureInput): void {}
