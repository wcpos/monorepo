import { classifyPrintFailure, logTestPrintFailure, reportPrintFailure } from './print-failure';

const t = (key: string) => key;
const logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() };

describe('classifyPrintFailure', () => {
	it('treats a closed iOS print dialog as a cancel, not a failure', () => {
		const dismissed = Object.assign(new Error('Printing did not complete'), {
			code: 'ERR_PRINT_INCOMPLETE',
		});
		expect(classifyPrintFailure(dismissed)).toEqual({ cancelled: true });
		expect(classifyPrintFailure(new Error('Print job cancelled'))).toEqual({ cancelled: true });
	});

	it('codes an unreachable printer PRINT301 and a job that did not complete PRINT201', () => {
		expect(classifyPrintFailure(new Error('TCP connection to 10.0.0.5:9100 timed out'))).toEqual({
			cancelled: false,
			code: 'PRINT301',
		});
		expect(classifyPrintFailure(new Error('Star printer reported status: busy'))).toEqual({
			cancelled: false,
			code: 'PRINT201',
		});
	});

	it('codes a request that never left (axios Network Error / ERR_NETWORK) PRINT301', () => {
		expect(
			classifyPrintFailure(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }))
		).toEqual({ cancelled: false, code: 'PRINT301' });
	});

	it('keeps a receipt/asset fetch failure off the printer: PRINT201, not PRINT301', () => {
		expect(classifyPrintFailure(new Error('Failed to fetch receipt: 500'))).toEqual({
			cancelled: false,
			code: 'PRINT201',
		});
		expect(classifyPrintFailure(new Error('Failed to fetch thermal image asset'))).toEqual({
			cancelled: false,
			code: 'PRINT201',
		});
	});

	it('keeps a receipt fetch TIMEOUT off the printer too: PRINT201, while a printer timeout stays PRINT301', () => {
		// printFromUrl (system-print fallback with only a receiptUrl) converts its abort to this.
		expect(classifyPrintFailure(new Error('Receipt fetch timed out after 10000ms'))).toEqual({
			cancelled: false,
			code: 'PRINT201',
		});
		expect(classifyPrintFailure(new Error('USB print timed out after 10000ms'))).toEqual({
			cancelled: false,
			code: 'PRINT301',
		});
	});

	it('codes a typed printer connection failure PRINT301', () => {
		const connection = Object.assign(new Error('Could not reach the Epson printer'), {
			name: 'PrinterConnectionError',
		});
		expect(classifyPrintFailure(connection)).toEqual({ cancelled: false, code: 'PRINT301' });
	});

	it('codes any failed automatic print PRINT101 (the sale is saved; print it from the receipt)', () => {
		expect(classifyPrintFailure(new Error('ECONNREFUSED'), { autoPrint: true })).toEqual({
			cancelled: false,
			code: 'PRINT101',
		});
	});
});

describe('reportPrintFailure', () => {
	beforeEach(() => jest.clearAllMocks());

	it('logs a cancel forensically, with no row and no toast', () => {
		reportPrintFailure(logger, 'Receipt print failed', new Error('Printing did not complete'), t);

		expect(logger.debug).toHaveBeenCalledWith(
			'Receipt print failed (cancelled)',
			expect.anything()
		);
		expect(logger.error).not.toHaveBeenCalled();
		expect(logger.warn).not.toHaveBeenCalled();
	});

	it('never fails silently: one coded row, a toast, and the specific thing to check', () => {
		reportPrintFailure(logger, 'Receipt print failed', new Error('ECONNREFUSED 10.0.0.5'), t, {
			context: { orderId: 7 },
		});

		expect(logger.error).toHaveBeenCalledWith('Receipt print failed', {
			showToast: true,
			code: 'PRINT301',
			toast: { text2: 'settings.setup_err_refused' },
			context: { orderId: 7, error: 'ECONNREFUSED 10.0.0.5' },
		});
	});

	it('never tells the cashier the printer did not answer when the RECEIPT fetch timed out', () => {
		reportPrintFailure(
			logger,
			'Receipt print failed',
			new Error('Receipt fetch timed out after 10000ms'),
			t
		);

		const [, report] = [...logger.error.mock.calls, ...logger.warn.mock.calls][0] ?? [];
		expect(report).toMatchObject({ code: 'PRINT201' });
		expect(report).not.toHaveProperty('toast');
	});

	it('reports a failed autoprint at PRINT101’s own severity (warn)', () => {
		reportPrintFailure(logger, 'Receipt print failed', new Error('boom'), t, { autoPrint: true });

		expect(logger.error).not.toHaveBeenCalled();
		expect(logger.warn).toHaveBeenCalledWith(
			'Receipt print failed',
			expect.objectContaining({ showToast: true, code: 'PRINT101' })
		);
	});
});

describe('logTestPrintFailure', () => {
	beforeEach(() => jest.clearAllMocks());

	it('writes the coded row (no toast — the settings screen shows its own)', () => {
		logTestPrintFailure(logger, new Error('TCP connection to 10.0.0.5:9100 timed out'), {
			source: 'printing-settings',
		});

		expect(logger.error).toHaveBeenCalledWith('Test print failed', {
			code: 'PRINT301',
			context: {
				source: 'printing-settings',
				error: 'TCP connection to 10.0.0.5:9100 timed out',
			},
		});
	});

	it('keeps a cancelled test print forensic', () => {
		logTestPrintFailure(logger, new Error('Print job cancelled'));

		expect(logger.error).not.toHaveBeenCalled();
		expect(logger.debug).toHaveBeenCalled();
	});

	it('never files a drawer that did not open as a failed print job', () => {
		logTestPrintFailure(logger, new Error('Epson print failed (code: EX_BUSY)'), {}, 'drawer');

		expect(logger.error).not.toHaveBeenCalled();
		expect(logger.warn).toHaveBeenCalledWith('Cash drawer did not open', expect.anything());
	});
});
