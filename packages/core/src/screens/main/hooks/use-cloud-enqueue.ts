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
 * client, which is already scoped to the wcpos/v2 namespace.
 */
export function createCloudEnqueueFactory(http: RestClient) {
	return (_profile: PrinterProfile): CloudEnqueueFn => {
		return async (printerId, job) => {
			if (job.kind === 'order') {
				// Order-based job (Epson SDP / PrintNode): no payload — the server
				// renders + delivers from the order + template.
				const payload = {
					printer_id: printerId,
					order_id: job.orderId,
					template_id: job.templateId,
					auto_open_drawer: job.autoOpenDrawer === true,
					...(job.drawerConnector ? { drawer_connector: job.drawerConnector } : {}),
				};
				await http.post('/print-jobs', payload);
				return;
			}

			// Raw job (Star CloudPRNT et al.): client-rendered bytes uploaded as-is.
			await http.post('/print-jobs', {
				printer_id: printerId,
				payload: bytesToBase64(job.data),
				content_type: job.contentType,
			});
		};
	};
}
