const ROUTE_TEARDOWN_ERROR_MESSAGES = [
	'Target page, context or browser has been closed',
	'Test ended',
	'Response has been disposed',
	'Target.disposeBrowserContext',
];

export function isRouteTeardownError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	return ROUTE_TEARDOWN_ERROR_MESSAGES.some((message) =>
		error.message.includes(message)
	);
}
