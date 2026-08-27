import { toast } from './sonner';
import { Toast } from './index';

jest.mock('./sonner', () => ({
	toast: jest.fn(() => 'toast-id'),
	Toaster: () => null,
}));

describe('Toast test IDs', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('gives error toasts a stable semantic test ID', () => {
		Toast.show({ title: 'Request failed', type: 'error' });

		expect(toast).toHaveBeenCalledWith(
			'Request failed',
			expect.objectContaining({ testId: 'error-toast' })
		);
	});

	it('preserves a caller-provided test ID', () => {
		Toast.show({ title: 'Host blocked', type: 'error', testId: 'toast-HOST141' });

		expect(toast).toHaveBeenCalledWith(
			'Host blocked',
			expect.objectContaining({ testId: 'toast-HOST141' })
		);
	});
});
