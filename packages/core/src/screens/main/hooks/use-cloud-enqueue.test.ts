import { createCloudEnqueueFactory } from './use-cloud-enqueue';

describe('createCloudEnqueueFactory', () => {
	it('POSTs base64 payload + content type for a raw job (Star CloudPRNT, unchanged)', async () => {
		const post = jest.fn().mockResolvedValue({ data: {} });
		const factory = createCloudEnqueueFactory({ post });
		const enqueue = factory({ cloudPrinterId: 'reg-7' } as never);

		await enqueue('reg-7', {
			kind: 'raw',
			data: new Uint8Array([0x41, 0x42]),
			contentType: 'application/octet-stream',
		});

		expect(post).toHaveBeenCalledWith('/print-jobs', {
			printer_id: 'reg-7',
			payload: 'QUI=',
			content_type: 'application/octet-stream',
		});
	});

	it('POSTs order_id + template_id (no payload) for an order-based job (Epson/PrintNode)', async () => {
		const post = jest.fn().mockResolvedValue({ data: {} });
		const factory = createCloudEnqueueFactory({ post });
		const enqueue = factory({ cloudPrinterId: 'reg-7' } as never);

		await enqueue('reg-7', {
			kind: 'order',
			orderId: 4567,
			templateId: '88',
		});

		expect(post).toHaveBeenCalledWith('/print-jobs', {
			printer_id: 'reg-7',
			order_id: 4567,
			template_id: '88',
			auto_open_drawer: false,
		});
	});

	it('POSTs drawer settings for an order-based job', async () => {
		const post = jest.fn().mockResolvedValue({ data: {} });
		const factory = createCloudEnqueueFactory({ post });
		const enqueue = factory({ cloudPrinterId: 'reg-7' } as never);

		await enqueue('reg-7', {
			kind: 'order',
			orderId: 123,
			templateId: 'receipt',
			autoOpenDrawer: true,
			drawerConnector: 'pin5',
		});

		expect(post).toHaveBeenCalledWith('/print-jobs', {
			printer_id: 'reg-7',
			order_id: 123,
			template_id: 'receipt',
			auto_open_drawer: true,
			drawer_connector: 'pin5',
		});
	});
});
