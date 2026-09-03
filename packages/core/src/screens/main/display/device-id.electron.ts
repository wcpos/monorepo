let deviceIdPromise: Promise<string> | undefined;

export function getDeviceId(): Promise<string> {
	deviceIdPromise ??= Promise.resolve(
		(window as unknown as { electron: { installId: string } }).electron.installId
	);
	return deviceIdPromise;
}
