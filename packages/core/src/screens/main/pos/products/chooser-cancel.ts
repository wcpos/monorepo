/**
 * The browser's serial/HID device chooser rejects with NotFoundError when the
 * cashier closes it without picking a device (AbortError on some builds). That is
 * a cancel, not a scanner fault.
 */
export function isChooserCancel(error: unknown): boolean {
	const name = (error as { name?: unknown } | null)?.name;
	return name === 'NotFoundError' || name === 'AbortError';
}
