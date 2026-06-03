/**
 * @jest-environment jsdom
 */
import { saveOrSharePdf } from './save-or-share-pdf.web';

function readBlobAsBytes(blob: Blob): Promise<number[]> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.addEventListener('load', () => {
			const buffer = reader.result as ArrayBuffer;
			resolve(Array.from(new Uint8Array(buffer)));
		});
		reader.addEventListener('error', () => reject(reader.error));
		reader.readAsArrayBuffer(blob);
	});
}

describe('saveOrSharePdf on web', () => {
	const originalCreateObjectURL = URL.createObjectURL;
	const originalRevokeObjectURL = URL.revokeObjectURL;

	beforeEach(() => {
		URL.createObjectURL = jest.fn(() => 'blob:receipt-pdf');
		URL.revokeObjectURL = jest.fn();
	});

	afterEach(() => {
		URL.createObjectURL = originalCreateObjectURL;
		URL.revokeObjectURL = originalRevokeObjectURL;
		jest.restoreAllMocks();
	});

	it('saves a PDF blob by clicking a temporary download link', async () => {
		const click = jest.fn();
		const appendChild = jest.spyOn(document.body, 'appendChild');
		const removeChild = jest.spyOn(document.body, 'removeChild');
		const createElement = jest.spyOn(document, 'createElement');
		createElement.mockImplementation((tagName: string) => {
			const element = document.createElementNS('http://www.w3.org/1999/xhtml', tagName);
			if (tagName === 'a') {
				Object.defineProperty(element, 'click', { value: click });
			}
			return element as HTMLElement;
		});

		const pdfBody = new Blob(['%PDF-1.4'], { type: 'application/pdf' });

		await saveOrSharePdf(pdfBody, 'receipt-42.pdf');

		const anchor = appendChild.mock.calls[0]?.[0] as HTMLAnchorElement;
		expect(URL.createObjectURL).toHaveBeenCalledWith(pdfBody);
		expect(anchor.href).toBe('blob:receipt-pdf');
		expect(anchor.download).toBe('receipt-42.pdf');
		expect(click).toHaveBeenCalledTimes(1);
		expect(removeChild).toHaveBeenCalledWith(anchor);
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:receipt-pdf');
	});

	it('decodes base64 data URI payloads before creating the download blob', async () => {
		const click = jest.fn();
		const createElement = jest.spyOn(document, 'createElement');
		createElement.mockImplementation((tagName: string) => {
			const element = document.createElementNS('http://www.w3.org/1999/xhtml', tagName);
			if (tagName === 'a') {
				Object.defineProperty(element, 'click', { value: click });
			}
			return element as HTMLElement;
		});
		const pdfBody = `data:application/pdf;base64,${btoa('%PDF')}`;

		await saveOrSharePdf(pdfBody, 'receipt-42.pdf');

		const blob = (URL.createObjectURL as jest.Mock).mock.calls[0]?.[0] as Blob;
		const bytes = await readBlobAsBytes(blob);

		expect(blob.type).toBe('application/pdf');
		expect(bytes).toEqual([0x25, 0x50, 0x44, 0x46]);
		expect(click).toHaveBeenCalledTimes(1);
	});
});
