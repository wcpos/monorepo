import { createCloudEnqueueFactory } from './use-cloud-enqueue';

describe('createCloudEnqueueFactory', () => {
	it('POSTs base64 payload + content type to the print-jobs endpoint', async () => {
		const post = jest.fn().mockResolvedValue({ data: {} });
		const factory = createCloudEnqueueFactory({ post });
		const enqueue = factory({ cloudPrinterId: 'reg-7' } as never);

		await enqueue('reg-7', {
			data: new Uint8Array([0x41, 0x42]),
			contentType: 'application/octet-stream',
		});

		expect(post).toHaveBeenCalledWith('/print-jobs', {
			printer_id: 'reg-7',
			payload: 'QUI=',
			content_type: 'application/octet-stream',
		});
	});
});
