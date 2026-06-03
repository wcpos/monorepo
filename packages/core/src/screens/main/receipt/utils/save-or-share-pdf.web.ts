export type PdfBytes = Blob | ArrayBuffer | Uint8Array | string;

const PDF_MIME_TYPE = 'application/pdf';
const BASE64_DATA_URI_PREFIX = 'base64,';

function decodeBase64Pdf(body: string): ArrayBuffer {
	const dataUriIndex = body.indexOf(BASE64_DATA_URI_PREFIX);
	const base64 =
		dataUriIndex === -1 ? body : body.slice(dataUriIndex + BASE64_DATA_URI_PREFIX.length);
	const binary = atob(base64);
	const buffer = new ArrayBuffer(binary.length);
	const bytes = new Uint8Array(buffer);

	for (let index = 0; index < binary.length; index++) {
		bytes[index] = binary.charCodeAt(index);
	}

	return buffer;
}

/**
 * Normalize the HTTP response payload into a browser Blob for object URL download.
 */
function toPdfBlob(body: PdfBytes): Blob {
	if (body instanceof Blob && body.type === PDF_MIME_TYPE) {
		return body;
	}

	if (body instanceof Uint8Array) {
		const copy = new ArrayBuffer(body.byteLength);
		new Uint8Array(copy).set(body);
		return new Blob([copy], { type: PDF_MIME_TYPE });
	}

	if (typeof body === 'string') {
		return new Blob([decodeBase64Pdf(body)], { type: PDF_MIME_TYPE });
	}

	return new Blob([body], { type: PDF_MIME_TYPE });
}

/**
 * Save the PDF through the browser's native download flow.
 */
export async function saveOrSharePdf(body: PdfBytes, filename: string): Promise<void> {
	const blob = toPdfBlob(body);
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');

	try {
		anchor.href = url;
		anchor.download = filename;
		anchor.style.display = 'none';
		document.body.appendChild(anchor);
		anchor.click();
	} finally {
		if (anchor.parentNode) {
			document.body.removeChild(anchor);
		}
		URL.revokeObjectURL(url);
	}
}
