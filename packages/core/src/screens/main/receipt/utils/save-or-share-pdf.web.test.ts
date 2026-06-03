/**
 * @jest-environment jsdom
 */
import { saveOrSharePdf } from './save-or-share-pdf.web';

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
});
