export function storeAnsweredWithStatus(error: unknown): number | null {
	const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
	return typeof status === 'number' ? status : null;
}
