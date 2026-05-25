/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';

import { usePrinterDialogForm } from './use-printer-dialog-form';
import { DEFAULT_FORM_VALUES, nativeOrCloudPrinterSchema } from '../schema';

import type { PrinterFormValues } from '../schema';

jest.mock('@wcpos/printer', () => {
	interface MockProfile {
		cloudPrinterId?: string;
	}
	interface MockJob {
		data: Uint8Array;
		contentType: string;
	}
	interface MockOptions {
		cloudEnqueueFactory?: (
			profile: MockProfile
		) => (printerId: string, job: MockJob) => Promise<void>;
	}
	return {
		PrinterService: class {
			constructor(private readonly options: MockOptions = {}) {}
			testPrint(profile: MockProfile) {
				const enqueue = this.options.cloudEnqueueFactory?.(profile);
				if (!enqueue || !profile.cloudPrinterId) {
					throw new Error('Cloud printing is not configured');
				}
				return enqueue(profile.cloudPrinterId, {
					data: new Uint8Array([1]),
					contentType: 'application/octet-stream',
				});
			}
		},
		probeVendor: jest.fn(),
	};
});

jest.mock('../../../../../contexts/app-state', () => ({
	useAppState: () => ({
		storeDB: {
			collections: {
				printer_profiles: {
					find: jest.fn(),
					findOne: jest.fn(),
					insert: jest.fn(),
				},
			},
		},
	}),
}));

jest.mock('../../../../../contexts/translations', () => ({
	useT: () => (_key: string, fallback?: string) => fallback ?? _key,
}));

jest.mock('uuid', () => ({ v4: () => 'uuid-1' }));

jest.mock('@wcpos/components/toast', () => ({
	Toast: { show: jest.fn() },
}));

const cloudDefaults: PrinterFormValues = {
	...DEFAULT_FORM_VALUES,
	name: 'Cloud printer',
	connectionType: 'cloud',
	cloudPrinterId: 'reg-7',
};

describe('usePrinterDialogForm cloud printing', () => {
	it('uses an injected cloud enqueue factory for cloud test prints', async () => {
		const enqueue = jest.fn().mockResolvedValue(undefined);
		const { result } = renderHook(() =>
			usePrinterDialogForm({
				open: false,
				schema: nativeOrCloudPrinterSchema,
				defaultValues: cloudDefaults,
				deriveVendorDefaults: () => ({ language: 'esc-pos', port: 9100 }),
				printerCount: 0,
				onSave: jest.fn(),
				cloudEnqueueFactory: () => enqueue,
			})
		);

		await act(async () => {
			await result.current.handleTestPrint();
		});

		expect(enqueue).toHaveBeenCalledWith(
			'reg-7',
			expect.objectContaining({ contentType: 'application/octet-stream' })
		);
	});
});
