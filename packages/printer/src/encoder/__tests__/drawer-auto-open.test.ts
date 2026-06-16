import { encodeReceipt } from '../encode-receipt';
import { encodeThermalTemplateForPrint } from '../thermal-print';
import { sampleReceiptData } from './fixtures';

/** Count ESC/POS cash-drawer kick pulses (ESC p => 0x1B 0x70) in a byte stream. */
function countPulses(bytes: Uint8Array): number {
	let count = 0;
	for (let i = 0; i < bytes.length - 1; i++) {
		if (bytes[i] === 0x1b && bytes[i + 1] === 0x70) count++;
	}
	return count;
}

/** A thermal template with no <drawer/> of its own. */
const TEMPLATE_WITHOUT_DRAWER = '<receipt paper-width="48"><text>Receipt</text><cut /></receipt>';

/** Same template but with an explicit, unconditional <drawer/>. */
const TEMPLATE_WITH_DRAWER =
	'<receipt paper-width="48"><text>Receipt</text><drawer /><cut /></receipt>';

describe('cash drawer auto-open across print paths', () => {
	describe('built-in default encoder (encodeReceipt)', () => {
		it('emits exactly one pulse when openDrawer is true', () => {
			expect(countPulses(encodeReceipt(sampleReceiptData, { openDrawer: true }))).toBe(1);
		});

		it('emits no pulse when openDrawer is false', () => {
			expect(countPulses(encodeReceipt(sampleReceiptData, { openDrawer: false }))).toBe(0);
		});
	});

	describe('thermal template path (encodeThermalTemplateForPrint)', () => {
		it('honours openDrawer for a template without <drawer/> (regression for the bug)', async () => {
			const bytes = await encodeThermalTemplateForPrint({
				templateXml: TEMPLATE_WITHOUT_DRAWER,
				receiptData: sampleReceiptData,
				maxWidthDots: 576,
				encodeOptions: { openDrawer: true },
			});
			expect(countPulses(bytes)).toBe(1);
		});

		it('emits no pulse when openDrawer is false and the template has no <drawer/>', async () => {
			const bytes = await encodeThermalTemplateForPrint({
				templateXml: TEMPLATE_WITHOUT_DRAWER,
				receiptData: sampleReceiptData,
				maxWidthDots: 576,
				encodeOptions: { openDrawer: false },
			});
			expect(countPulses(bytes)).toBe(0);
		});

		it('does not double-kick when the template already opens the drawer', async () => {
			const bytes = await encodeThermalTemplateForPrint({
				templateXml: TEMPLATE_WITH_DRAWER,
				receiptData: sampleReceiptData,
				maxWidthDots: 576,
				encodeOptions: { openDrawer: true },
			});
			expect(countPulses(bytes)).toBe(1);
		});

		it('still respects an explicit <drawer/> even when openDrawer is false', async () => {
			const bytes = await encodeThermalTemplateForPrint({
				templateXml: TEMPLATE_WITH_DRAWER,
				receiptData: sampleReceiptData,
				maxWidthDots: 576,
				encodeOptions: { openDrawer: false },
			});
			expect(countPulses(bytes)).toBe(1);
		});
	});
});
