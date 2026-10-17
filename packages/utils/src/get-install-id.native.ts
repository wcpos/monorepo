import { File, Paths } from 'expo-file-system';

export function getInstallId(): string | undefined {
	try {
		const file = new File(Paths.document, 'wcpos_install_id');
		let id = file.exists ? file.textSync() : '';
		if (!id) {
			id = globalThis.crypto.randomUUID();
			file.write(id);
		}
		return id;
	} catch {
		return undefined;
	}
}
