import { buildPrinterSetupReport, formatPrinterSetupReport } from './setup-report';

const snapshot = jest.fn();
jest.mock('@wcpos/utils/logger', () => ({ snapshotRecorder: () => snapshot() }));

it('keeps only printer log lines, the last 50, oldest first', () => {
	snapshot.mockReturnValue([
		{ timestamp: 1, message: 'sync', context: { category: 'wcpos.sync' } },
		...Array.from({ length: 60 }, (_, i) => ({
			timestamp: 1000 + i,
			message: `printer ${i}`,
			context: { category: 'wcpos.printer.setup', i },
		})),
	]);
	const report = buildPrinterSetupReport({
		app: { appVersion: '1.10.0', platformVersion: '1.10.0', platform: 'electron' },
		printer: { name: 'TM-m30III', vendor: 'epson', address: '192.168.1.131', port: 443 },
		identity: {
			vendor: 'epson',
			model: 'TM-m30III',
			lane: { port: 443, protocol: 'epos-print', encrypted: true },
			ports: [{ port: 443, state: 'open', protocol: 'epos-print' }],
			securePrinting: true,
		},
		setup: { phase: 'trouble', testPages: 2, failure: { message: 'timeout', diagnostics: null } },
	});
	expect(report.logs).toHaveLength(50);
	expect(report.logs[0].message).toBe('printer 10');
	expect(report.logs[49].message).toBe('printer 59');
	expect(report.identity?.securePrinting).toBe(true);
	expect(report.setup?.failure?.message).toBe('timeout');
	const text = formatPrinterSetupReport(report);
	expect(JSON.parse(text).app.platform).toBe('electron');
	expect(text).not.toContain('wcpos.sync');
});
