import { describe, expect, it } from 'vitest';

import { encodeThermalTemplate } from '../index';

/** Count ESC/POS cash-drawer kick pulses (ESC p => 0x1B 0x70) in a byte stream. */
function countPulses(bytes: Uint8Array): number {
	let count = 0;
	for (let i = 0; i < bytes.length - 1; i++) {
		if (bytes[i] === 0x1b && bytes[i + 1] === 0x70) count++;
	}
	return count;
}

/** Index of the first occurrence of a byte sequence, or -1. */
function sequenceIndex(bytes: Uint8Array, sequence: number[]): number {
	for (let i = 0; i <= bytes.length - sequence.length; i++) {
		if (sequence.every((value, offset) => bytes[i + offset] === value)) return i;
	}
	return -1;
}

const PULSE = [0x1b, 0x70]; // ESC p — cash-drawer kick
const CUT = [0x1d, 0x56]; // GS V — paper cut

function opaqueBlackImageData(width: number, height: number): ImageData {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let offset = 0; offset < data.length; offset += 4) {
		data[offset + 3] = 255;
	}
	return { width, height, data } as ImageData;
}

const TEMPLATE_NO_DRAWER = '<receipt paper-width="32"><text>Hi</text><cut /></receipt>';
const TEMPLATE_WITH_DRAWER = '<receipt paper-width="32"><text>Hi</text><drawer /><cut /></receipt>';

describe('renderEscpos openDrawer option', () => {
	it('appends a single pulse when openDrawer is true and the template has no <drawer/>', () => {
		const bytes = encodeThermalTemplate(TEMPLATE_NO_DRAWER, {}, { openDrawer: true });
		expect(countPulses(bytes)).toBe(1);
	});

	it('appends nothing when openDrawer is false', () => {
		const bytes = encodeThermalTemplate(TEMPLATE_NO_DRAWER, {}, { openDrawer: false });
		expect(countPulses(bytes)).toBe(0);
	});

	it('does not duplicate an explicit <drawer/> when openDrawer is also true', () => {
		const bytes = encodeThermalTemplate(TEMPLATE_WITH_DRAWER, {}, { openDrawer: true });
		expect(countPulses(bytes)).toBe(1);
	});

	it('opens the drawer before the cut, matching the built-in template order', () => {
		const bytes = encodeThermalTemplate(TEMPLATE_NO_DRAWER, {}, { openDrawer: true });
		const pulseIndex = sequenceIndex(bytes, PULSE);
		const cutIndex = sequenceIndex(bytes, CUT);
		expect(pulseIndex).toBeGreaterThanOrEqual(0);
		expect(cutIndex).toBeGreaterThanOrEqual(0);
		expect(pulseIndex).toBeLessThan(cutIndex);
	});

	it('honours openDrawer in the full-receipt raster branch', () => {
		const bytes = encodeThermalTemplate(
			TEMPLATE_NO_DRAWER,
			{},
			{
				openDrawer: true,
				fullReceiptRasterImage: {
					image: opaqueBlackImageData(32, 16),
					width: 32,
					height: 16,
					algorithm: 'threshold',
					threshold: 128,
				},
			}
		);
		expect(countPulses(bytes)).toBe(1);
	});

	it('still opens the drawer in raster mode when the template has a non-trailing <drawer/>', () => {
		// The raster path only re-emits *trailing* control nodes, so a mid-template
		// <drawer/> is dropped. With openDrawer on we must still emit exactly one pulse.
		const template = '<receipt paper-width="32"><drawer /><text>Thanks</text><cut /></receipt>';
		const bytes = encodeThermalTemplate(
			template,
			{},
			{
				openDrawer: true,
				fullReceiptRasterImage: {
					image: opaqueBlackImageData(32, 16),
					width: 32,
					height: 16,
					algorithm: 'threshold',
					threshold: 128,
				},
			}
		);
		expect(countPulses(bytes)).toBe(1);
	});

	it('does not double-kick in raster mode when the template has a trailing <drawer/>', () => {
		const bytes = encodeThermalTemplate(
			TEMPLATE_WITH_DRAWER,
			{},
			{
				openDrawer: true,
				fullReceiptRasterImage: {
					image: opaqueBlackImageData(32, 16),
					width: 32,
					height: 16,
					algorithm: 'threshold',
					threshold: 128,
				},
			}
		);
		expect(countPulses(bytes)).toBe(1);
	});
});
