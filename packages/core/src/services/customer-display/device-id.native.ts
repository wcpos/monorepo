import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';

const INSTALL_ID_FILE = `${FileSystem.documentDirectory}wcpos_install_id`;

let deviceId: Promise<string> | undefined;

export function getDeviceId(): Promise<string> {
	deviceId ??= FileSystem.readAsStringAsync(INSTALL_ID_FILE).catch(async () => {
		const created = Crypto.randomUUID();
		await FileSystem.writeAsStringAsync(INSTALL_ID_FILE, created);
		return created;
	});
	return deviceId;
}
