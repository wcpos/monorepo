import { File, Paths } from 'expo-file-system';
import { v4 as uuidv4 } from 'uuid';

// Distinct from the telemetry install id, which tracking consent can delete.
const DEVICE_ID_KEY = 'wcpos_device_id';
let deviceIdPromise: Promise<string> | undefined;

async function loadDeviceId(): Promise<string> {
	const file = new File(Paths.document, DEVICE_ID_KEY);
	if (file.exists) {
		const saved = (await file.text()).trim();
		if (saved) return saved;
	}
	const id = uuidv4();
	file.write(id);
	return id;
}

export function getDeviceId(): Promise<string> {
	deviceIdPromise ??= loadDeviceId();
	return deviceIdPromise;
}
