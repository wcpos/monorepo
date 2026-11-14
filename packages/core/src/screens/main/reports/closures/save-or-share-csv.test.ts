import { saveOrShareCsv } from './save-or-share-csv';
const write = jest.fn();
const share = jest.fn();
jest.mock('expo-file-system/legacy', () => ({
	cacheDirectory: 'file:///cache/',
	EncodingType: { UTF8: 'utf8' },
	writeAsStringAsync: (...args: unknown[]) => write(...args),
}));
jest.mock('expo-sharing', () => ({ shareAsync: (...args: unknown[]) => share(...args) }));
// Revert: write binary/PDF data or share the wrong path/MIME.
it('writes UTF-8 CSV to the native cache and shares that csv path', async () => {
	await saveOrShareCsv('Café,二', 'closures.csv');
	expect(write).toHaveBeenCalledWith('file:///cache/closures.csv', 'Café,二', { encoding: 'utf8' });
	expect(share).toHaveBeenCalledWith('file:///cache/closures.csv', {
		mimeType: 'text/csv',
		UTI: 'public.comma-separated-values-text',
		dialogTitle: 'closures.csv',
	});
});
