import React from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { printRawTcp } from '../../studio-api';
import { PrintSection } from './PrintSection';

import type { StudioRenderResult } from '../../studio-core';

type ThermalStudioRenderResult = Extract<StudioRenderResult, { kind: 'thermal' }>;

vi.mock('../../studio-api', () => ({
	printRawTcp: vi.fn(),
}));

const mockedPrintRawTcp = vi.mocked(printRawTcp);

beforeEach(() => {
	mockedPrintRawTcp.mockReset();
});

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
	it('re-enables send button after dispatch and ignores stale completion', async () => {
		let resolveFirst: ((value: { ok: true; bytesWritten: number }) => void) | undefined;
		let resolveSecond: ((value: { ok: true; bytesWritten: number }) => void) | undefined;
		mockedPrintRawTcp
			.mockReturnValueOnce(
				new Promise((resolve) => {
					resolveFirst = resolve;
				})
			)
			.mockReturnValueOnce(
				new Promise((resolve) => {
					resolveSecond = resolve;
				})
			);

		render(
			<PrintSection
				rendered={thermalResult(new Uint8Array([0x1b, 0x40, 0x41]))}
				onOpenPrintDialog={vi.fn()}
				onError={vi.fn()}
			/>
		);

		fireEvent.change(screen.getByLabelText('Host'), { target: { value: '127.0.0.1' } });
		fireEvent.click(screen.getByRole('button', { name: 'Send to printer' }));

		await waitFor(() => expect(mockedPrintRawTcp).toHaveBeenCalledTimes(1));
		expect(screen.getByRole('button', { name: 'Send to printer' })).toBeEnabled();
		expect(screen.getByText(/print queued/i)).toBeInTheDocument();

		fireEvent.click(screen.getByRole('button', { name: 'Send to printer' }));
		await waitFor(() => expect(mockedPrintRawTcp).toHaveBeenCalledTimes(2));

		await act(async () => {
			resolveFirst?.({ ok: true, bytesWritten: 1 });
		});

		expect(screen.queryByText(/1 bytes/)).not.toBeInTheDocument();
		expect(screen.getByText(/print queued/i)).toBeInTheDocument();

		await act(async () => {
			resolveSecond?.({ ok: true, bytesWritten: 3 });
		});
		await waitFor(() => expect(screen.getByText(/3 bytes/)).toBeInTheDocument());
	});

	it('ignores a pending TCP completion when a later action fails before dispatch', async () => {
		let resolvePrint: ((value: { ok: true; bytesWritten: number }) => void) | undefined;
		mockedPrintRawTcp.mockReturnValueOnce(
			new Promise((resolve) => {
				resolvePrint = resolve;
			})
		);

		render(
			<PrintSection
				rendered={thermalResult(new Uint8Array([0x1b, 0x40, 0x41]))}
				onOpenPrintDialog={vi.fn()}
				onError={vi.fn()}
			/>
		);

		fireEvent.change(screen.getByLabelText('Host'), { target: { value: '127.0.0.1' } });
		fireEvent.click(screen.getByRole('button', { name: 'Send to printer' }));

		await waitFor(() => expect(mockedPrintRawTcp).toHaveBeenCalledTimes(1));
		expect(screen.getByRole('button', { name: 'Send to printer' })).toBeEnabled();
		expect(screen.getByText(/print queued/i)).toBeInTheDocument();

		fireEvent.change(screen.getByLabelText('Port'), { target: { value: 'invalid' } });
		fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));

		await waitFor(() =>
			expect(screen.getByText('Printer port must be between 1 and 65535')).toBeInTheDocument()
		);
		expect(mockedPrintRawTcp).toHaveBeenCalledTimes(1);

		await act(async () => {
			resolvePrint?.({ ok: true, bytesWritten: 3 });
		});

		expect(screen.queryByText(/3 bytes/)).not.toBeInTheDocument();
		expect(screen.getByText('Printer port must be between 1 and 65535')).toBeInTheDocument();
	});

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

		fireEvent.change(screen.getByLabelText('Host'), { target: { value: '127.0.0.1' } });
		fireEvent.click(screen.getByRole('button', { name: 'Send to printer' }));

		await waitFor(() =>
			expect(mockedPrintRawTcp).toHaveBeenCalledWith(
				expect.objectContaining({ data: prepared.escposBase64 })
			)
		);
		expect(container.textContent).toContain('42Btext');
		expect(container.textContent).not.toContain('41Atext');
	});

	it('defaults the LAN printer host and 9100 port', () => {
		render(
			<PrintSection
				rendered={thermalResult(new Uint8Array([0x1b, 0x40]))}
				onOpenPrintDialog={vi.fn()}
				onError={vi.fn()}
			/>
		);

		expect(screen.getByLabelText('Host')).toHaveValue('192.168.1.167');
		expect(screen.getByLabelText('Port')).toHaveValue('9100');
	});
});
