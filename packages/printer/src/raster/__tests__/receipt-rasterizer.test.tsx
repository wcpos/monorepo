import * as React from 'react';

import { render, waitFor } from '@testing-library/react';

import ReceiptRasterizer from '../receipt-rasterizer.dom';

vi.mock('../../renderer', () => ({
	loadBarcodeLibrary: () => Promise.reject(new Error('chunk')),
	encodeThermalTemplate: () => new Uint8Array([1, 2, 3]),
}));
vi.mock('../../encoder/render-preview', () => ({
	renderPreview: () => ({ html: '<p>receipt</p>' }),
}));
vi.mock('../rasterize-element', () => ({
	stripThermalControlNodesForRaster: (xml: string) => xml,
	rasterizeReceiptElement: () => Promise.resolve({}),
}));

it('encodes the receipt after a barcode chunk load fails', async () => {
	const onEncoded = vi.fn(async () => undefined);
	const onError = vi.fn(async () => undefined);

	render(
		<ReceiptRasterizer
			jobId="j"
			templateXml="<receipt/>"
			receiptData={{}}
			maxWidthDots={384}
			paperFrameClass="thermal-80"
			encodeOptions={{ language: 'esc-pos', columns: 48, emitEscPrintMode: false }}
			onEncoded={onEncoded}
			onError={onError}
		/>
	);

	await waitFor(() => expect(onEncoded).toHaveBeenCalledWith('j', expect.any(String)));
	expect(onError).not.toHaveBeenCalled();
});
