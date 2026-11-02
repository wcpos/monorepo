/** @jest-environment jsdom */
import { saveOrShareCsv } from './save-or-share-csv.web';
// Revert: use PDF MIME/extension or lose Unicode during download.
it('downloads UTF-8 CSV using a temporary link', async () => {
	URL.createObjectURL = jest.fn(() => 'blob:csv');
	URL.revokeObjectURL = jest.fn();
	const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
	const append = jest.spyOn(document.body, 'appendChild');
	await saveOrShareCsv('Café,二', 'closures.csv');
	const blob = (URL.createObjectURL as jest.Mock).mock.calls[0][0] as Blob;
	expect(blob.type).toBe('text/csv;charset=utf-8');
	const text = await new Promise((resolve) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.readAsText(blob);
	});
	expect(text).toBe('Café,二');
	expect((append.mock.calls[0][0] as HTMLAnchorElement).download).toBe('closures.csv');
	expect(click).toHaveBeenCalledTimes(1);
	expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:csv');
	expect(document.querySelector('a')).toBeNull();
	jest.restoreAllMocks();
});
