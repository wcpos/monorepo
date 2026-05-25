import type { CloudEnqueueFn, PrinterProfile } from '@wcpos/printer';

interface RestClient {
	post: (url: string, data: unknown, config?: Record<string, unknown>) => Promise<unknown>;
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

/**
 * Builds the cloud enqueue factory the PrinterService uses for cloud profiles.
 * POSTs the rendered job to the WCPOS plugin queue via the authenticated REST
 * client, which is already scoped to the wcpos/v1 namespace.
 */
export function createCloudEnqueueFactory(http: RestClient) {
	return (_profile: PrinterProfile): CloudEnqueueFn => {
		return async (printerId, job) => {
			await http.post('/print-jobs', {
				printer_id: printerId,
				payload: bytesToBase64(job.data),
				content_type: job.contentType,
			});
		};
	};
}
