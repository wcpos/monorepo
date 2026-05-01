import { useState } from 'react';

import { printRawTcp } from '../../studio-api';

import type { StudioRenderResult } from '../../studio-core';

interface PrintSectionProps {
	rendered: StudioRenderResult | null;
	onOpenPrintDialog: () => void;
	onError: (message: string | null) => void;
}

interface LastResult {
	kind: 'success' | 'error';
	message: string;
}

export function PrintSection({ rendered, onOpenPrintDialog, onError }: PrintSectionProps) {
	const [host, setHost] = useState('127.0.0.1');
	const [port, setPort] = useState('9100');
	const [lastResult, setLastResult] = useState<LastResult | null>(null);
	const [sending, setSending] = useState(false);

	const isThermal = rendered?.kind === 'thermal';

	async function sendToPrinter() {
		if (!rendered || rendered.kind !== 'thermal') return;
		setSending(true);
		onError(null);
		try {
			const result = await printRawTcp({
				host,
				port: Number(port),
				data: rendered.escposBase64,
			});
			setLastResult({
				kind: 'success',
				message: `Sent ${result.bytesWritten} bytes to ${host}:${port}`,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
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
		</div>
	);
}
