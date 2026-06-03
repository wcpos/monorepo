import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export type PdfBytes = Blob | ArrayBuffer | Uint8Array | string;

const PDF_MIME_TYPE = 'application/pdf';
const PDF_UTI = 'com.adobe.pdf';
const BASE64_DATA_URI_PREFIX = 'base64,';
const BINARY_CHUNK_SIZE = 0x8000;

function isBlob(body: PdfBytes): body is Blob {
	return typeof Blob !== 'undefined' && body instanceof Blob;
}

/**
 * Convert downloaded PDF bytes into base64 for Expo FileSystem.
 */
async function toBase64(body: PdfBytes): Promise<string> {
	if (typeof body === 'string') {
		const dataUriIndex = body.indexOf(BASE64_DATA_URI_PREFIX);
		if (dataUriIndex !== -1) {
			return body.slice(dataUriIndex + BASE64_DATA_URI_PREFIX.length);
		}
		return btoa(body);
	}

	if (isBlob(body)) {
		return toBase64(new Uint8Array(await body.arrayBuffer()));
	}

	const bytes = body instanceof ArrayBuffer ? new Uint8Array(body) : body;
	let binary = '';
	for (let offset = 0; offset < bytes.length; offset += BINARY_CHUNK_SIZE) {
		const chunk = bytes.subarray(offset, offset + BINARY_CHUNK_SIZE);
		binary += String.fromCharCode(...chunk);
	}

	return btoa(binary);
}

/**
 * Persist the PDF in the app cache, then open the platform share sheet.
 * If sharing is unavailable, fall back to the native print dialog for the local PDF file.
 */
export async function saveOrSharePdf(body: PdfBytes, filename: string): Promise<void> {
	const cacheDirectory = FileSystem.cacheDirectory;
	if (!cacheDirectory) {
		throw new Error('Unable to save receipt PDF: cache directory is unavailable');
	}

	const uri = `${cacheDirectory}${filename}`;
	await FileSystem.writeAsStringAsync(uri, await toBase64(body), {
		encoding: FileSystem.EncodingType.Base64,
	});

	if (await Sharing.isAvailableAsync()) {
		await Sharing.shareAsync(uri, {
			mimeType: PDF_MIME_TYPE,
			UTI: PDF_UTI,
			dialogTitle: filename,
		});
		return;
	}

	await Print.printAsync({ uri });
}
