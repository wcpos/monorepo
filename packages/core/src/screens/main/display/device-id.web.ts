import { v4 as uuidv4 } from 'uuid';

// Distinct from the telemetry install id, which tracking consent can delete.
const DEVICE_ID_KEY = 'wcpos_device_id';
let deviceIdPromise: Promise<string> | undefined;

async function loadDeviceId(): Promise<string> {
	const saved = window.localStorage.getItem(DEVICE_ID_KEY)?.trim();
	if (saved) return saved;
	const id = uuidv4();
	window.localStorage.setItem(DEVICE_ID_KEY, id);
	return id;
}

export function getDeviceId(): Promise<string> {
	deviceIdPromise ??= loadDeviceId();
	return deviceIdPromise;
}
