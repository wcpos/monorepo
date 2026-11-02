import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export async function saveOrShareCsv(body: string, filename: string): Promise<void> {
	if (!FileSystem.cacheDirectory) throw new Error('Cache directory unavailable');
	const uri = `${FileSystem.cacheDirectory}${filename}`;
	await FileSystem.writeAsStringAsync(uri, body, { encoding: FileSystem.EncodingType.UTF8 });
	await Sharing.shareAsync(uri, {
		mimeType: 'text/csv',
		UTI: 'public.comma-separated-values-text',
		dialogTitle: filename,
	});
}
