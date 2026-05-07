import React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { printRawTcp } from '../../studio-api';
import { PrintSection } from './PrintSection';

import type { StudioRenderResult } from '../../studio-core';

type ThermalStudioRenderResult = Extract<StudioRenderResult, { kind: 'thermal' }>;

vi.mock('../../studio-api', () => ({
	printRawTcp: vi.fn(),
}));

const mockedPrintRawTcp = vi.mocked(printRawTcp);

function thermalResult(bytes: Uint8Array): ThermalStudioRenderResult {
	return {
		kind: 'thermal',
		html: '<div />',
		escposBytes: bytes,
		escposBase64: btoa(String.fromCharCode(...bytes)),
		escposHex: Array.from(bytes)
			.map((byte) => byte.toString(16).padStart(2, '0'))
			.join(' '),
		escposAscii: '',
		data: {},
	};
}

describe('PrintSection', () => {
	it('shows prepared raw print bytes in the inspector after sending', async () => {
		mockedPrintRawTcp.mockResolvedValueOnce({ ok: true, bytesWritten: 3 });
		const prepared = thermalResult(new Uint8Array([0x1b, 0x40, 0x42]));

		const { container } = render(
			<PrintSection
				rendered={thermalResult(new Uint8Array([0x1b, 0x40, 0x41]))}
				onOpenPrintDialog={vi.fn()}
				onError={vi.fn()}
				onPrepareRawPrint={vi.fn(async () => prepared)}
			/>
		);

		fireEvent.click(screen.getByRole('button', { name: 'Send to printer' }));

		await waitFor(() =>
			expect(mockedPrintRawTcp).toHaveBeenCalledWith(
				expect.objectContaining({ data: prepared.escposBase64 })
			)
		);
		expect(container.textContent).toContain('42Btext');
		expect(container.textContent).not.toContain('41Atext');
	});
});
