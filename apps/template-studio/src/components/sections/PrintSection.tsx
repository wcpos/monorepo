import { useMemo, useState } from 'react';

import { decodeEscposBytes } from '../../lib/escpos-decoder';
import { debugError, debugInfo, debugLog } from '../../lib/debug-log';
import { bytesToBase64 } from '../../studio-core';
import { printRawTcp } from '../../studio-api';

import type { StudioRenderResult } from '../../studio-core';

interface PrintSectionProps {
	rendered: StudioRenderResult | null;
	onOpenPrintDialog: () => void;
	onError: (message: string | null) => void;
	onPrepareRawPrint?: () => Promise<{ escposBase64: string; escposBytes: Uint8Array }>;
}

interface LastResult {
	kind: 'success' | 'error';
	message: string;
}

const TEST_CONNECTION_BYTES = new Uint8Array([0x1b, 0x40]); // ESC @ — init printer

export function PrintSection({
	rendered,
	onOpenPrintDialog,
	onError,
	onPrepareRawPrint,
}: PrintSectionProps) {
	const [host, setHost] = useState('192.168.1.167');
	const [port, setPort] = useState('9100');
	const [lastResult, setLastResult] = useState<LastResult | null>(null);
	const [sending, setSending] = useState(false);
	const [showInspector, setShowInspector] = useState(false);
	const [preparedEscposBytes, setPreparedEscposBytes] = useState<Uint8Array | null>(null);

	const isThermal = rendered?.kind === 'thermal';

	const decodedSegments = useMemo(() => {
		const bytesToShow =
			preparedEscposBytes ?? (rendered?.kind === 'thermal' ? rendered.escposBytes : null);
		if (!bytesToShow) return [];
		return decodeEscposBytes(bytesToShow);
	}, [preparedEscposBytes, rendered]);

	function getConnectionTarget() {
		const normalizedHost = host.trim();
		const normalizedPort = port.trim();
		const parsedPort = Number.parseInt(normalizedPort, 10);
		if (!normalizedHost) throw new Error('Printer host is required');
		if (
			!/^\d+$/.test(normalizedPort) ||
			!Number.isInteger(parsedPort) ||
			parsedPort < 1 ||
			parsedPort > 65535
		) {
			throw new Error('Printer port must be between 1 and 65535');
		}
		return { host: normalizedHost, port: parsedPort };
	}

	async function sendToPrinter() {
		if (!rendered || rendered.kind !== 'thermal') return;
		debugInfo('print-section', 'send to printer clicked', {
			renderedBytes: rendered.escposBytes.length,
			renderedBase64Length: rendered.escposBase64.length,
			hasPrepareRawPrint: Boolean(onPrepareRawPrint),
		});
		setSending(true);
		onError(null);
		const start = performance.now();
		try {
			setPreparedEscposBytes(null);
			const target = getConnectionTarget();
			debugLog('print-section', 'connection target resolved', target);
			const prepared = onPrepareRawPrint ? await onPrepareRawPrint() : rendered;
			debugInfo('print-section', 'raw print payload prepared', {
				bytes: prepared.escposBytes.length,
				base64Length: prepared.escposBase64.length,
				elapsedMs: Math.round(performance.now() - start),
			});
			setPreparedEscposBytes(prepared.escposBytes);
			const result = await printRawTcp({
				...target,
				data: prepared.escposBase64,
			});
			const elapsed = ((performance.now() - start) / 1000).toFixed(2);
			debugInfo('print-section', 'raw TCP print succeeded', {
				bytesWritten: result.bytesWritten,
				elapsedSeconds: elapsed,
				target,
			});
			setLastResult({
				kind: 'success',
				message: `${result.bytesWritten} bytes · ${elapsed}s · ${target.host}:${target.port}`,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			debugError('print-section', 'raw TCP print failed', {
				error: error instanceof Error ? error.stack || error.message : String(error),
				elapsedMs: Math.round(performance.now() - start),
			});
			setLastResult({ kind: 'error', message });
		} finally {
			setSending(false);
		}
	}

	async function testConnection() {
		setSending(true);
		onError(null);
		try {
			setPreparedEscposBytes(null);
			const target = getConnectionTarget();
			debugInfo('print-section', 'test connection requested', target);
			const result = await printRawTcp({
				...target,
				data: bytesToBase64(TEST_CONNECTION_BYTES),
			});
			debugInfo('print-section', 'test connection succeeded', {
				target,
				bytesWritten: result.bytesWritten,
			});
			setLastResult({
				kind: 'success',
				message: `connection OK (${result.bytesWritten} bytes)`,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			debugError('print-section', 'test connection failed', {
				error: error instanceof Error ? error.stack || error.message : String(error),
			});
			setLastResult({ kind: 'error', message });
		} finally {
			setSending(false);
		}
	}

	return (
		<div className="print-section">
			<div className="button-row">
				<button type="button" onClick={onOpenPrintDialog} disabled={!rendered}>
					System print
				</button>
			</div>
			<div className="row">
				<label htmlFor="print-host">Host</label>
				<input
					id="print-host"
					type="text"
					value={host}
					onChange={(event) => setHost(event.target.value)}
					disabled={!isThermal}
				/>
			</div>
			<div className="row">
				<label htmlFor="print-port">Port</label>
				<input
					id="print-port"
					type="text"
					value={port}
					onChange={(event) => setPort(event.target.value)}
					disabled={!isThermal}
				/>
			</div>
			<div className="button-row">
				<button type="button" onClick={testConnection} disabled={!isThermal || sending}>
					Test connection
				</button>
				<button
					type="button"
					className="primary"
					onClick={sendToPrinter}
					disabled={!isThermal || sending}
				>
					{sending ? 'Sending…' : 'Send to printer'}
				</button>
			</div>
			{lastResult ? <p className={`last-result ${lastResult.kind}`}>{lastResult.message}</p> : null}
			{isThermal ? (
				<details
					className="inspect-bytes"
					open={showInspector}
					onToggle={(event) => setShowInspector((event.target as HTMLDetailsElement).open)}
				>
					<summary>Inspect bytes</summary>
					<div className="byte-table" role="table">
						<div className="col-h" role="columnheader">
							hex
						</div>
						<div className="col-h" role="columnheader">
							ascii
						</div>
						<div className="col-h" role="columnheader">
							decoded
						</div>
						{decodedSegments.map((segment) => (
							<div key={segment.offset} className="byte-row" style={{ display: 'contents' }}>
								<div className="hex">{segment.hex}</div>
								<div className="ascii">{segment.ascii}</div>
								<div className="decoded">{segment.decoded}</div>
							</div>
						))}
					</div>
				</details>
			) : null}
		</div>
	);
}
