import { useEffect, useMemo, useRef, useState } from 'react';

import { sanitizeHtml, sanitizeThermalPreviewHtml } from '@wcpos/receipt-renderer';

import { createRandomReceipt, formatSeed } from './randomizer';
import { fetchBundledTemplates, fetchWpPreview, paperWidths, printRawTcp } from './studio-api';
import { renderStudioTemplate, selectVisibleTemplate } from './studio-core';

import type { PaperWidth, StudioTemplate, TemplateEngine } from './studio-core';

export function App() {
	const [templates, setTemplates] = useState<StudioTemplate[]>([]);
	const [selectedTemplateId, setSelectedTemplateId] = useState('');
	const [paperWidth, setPaperWidth] = useState<PaperWidth>('80mm');
	const [engineFilter, setEngineFilter] = useState<TemplateEngine | 'all'>('all');
	const [storeUrl, setStoreUrl] = useState('http://localhost:8888');
	const [wpTemplateId, setWpTemplateId] = useState('');
	const [wpOrderId, setWpOrderId] = useState('');
	const [rawTcpHost, setRawTcpHost] = useState('127.0.0.1');
	const [rawTcpPort, setRawTcpPort] = useState('9100');
	const [status, setStatus] = useState('Loading bundled gallery templates…');
	const [seed, setSeed] = useState<number | string>('default');
	const previewFrameRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		fetchBundledTemplates()
			.then((loadedTemplates) => {
				setTemplates(loadedTemplates);
				setSelectedTemplateId(loadedTemplates[0]?.id ?? '');
				setStatus(
					'Edit gallery templates in woocommerce-pos/templates/gallery and Vite will hot-reload.'
				);
			})
			.catch((error: unknown) => setStatus(error instanceof Error ? error.message : String(error)));
	}, []);

	const filteredTemplates = useMemo(
		() =>
			templates.filter((template) => engineFilter === 'all' || template.engine === engineFilter),
		[engineFilter, templates]
	);
	const selectedTemplate = selectVisibleTemplate(filteredTemplates, selectedTemplateId);
	const randomReceipt = useMemo(() => createRandomReceipt({ seed }), [seed]);
	const fixture = useMemo(
		() => ({ ...randomReceipt.data, id: `random-${randomReceipt.seedHex}` }),
		[randomReceipt]
	);
	const rendered = selectedTemplate
		? renderStudioTemplate({ template: selectedTemplate, fixture, paperWidth })
		: null;
	const previewHtml =
		rendered?.kind === 'thermal'
			? sanitizeThermalPreviewHtml(rendered.html)
			: sanitizeHtml(rendered?.html ?? '');
	const diagnosticHtml = sanitizeHtml(
		rendered?.kind === 'logicless'
			? (rendered.diagnosticHtml ?? '<p>No preview_html diagnostic returned.</p>')
			: '<p>No preview_html diagnostic returned.</p>'
	);

	async function loadWpTemplate() {
		if (!wpTemplateId.trim()) return;
		setStatus(`Fetching ${wpTemplateId} from ${storeUrl} through the Vite proxy…`);
		try {
			const wpTemplate = await fetchWpPreview({
				storeUrl,
				templateId: wpTemplateId.trim(),
				orderId: wpOrderId.trim() || undefined,
			});
			setTemplates((current) => [
				wpTemplate,
				...current.filter((template) => template.id !== wpTemplate.id),
			]);
			setEngineFilter(wpTemplate.engine);
			setSelectedTemplateId(wpTemplate.id);
			setStatus('Loaded store preview using forwarded cookies and X-WCPOS: 1.');
		} catch (error) {
			setStatus(error instanceof Error ? error.message : String(error));
		}
	}

	function openPrintDialog() {
		if (!rendered) return;
		const printWindow = window.open(
			'',
			'wcpos-template-studio-print',
			'popup,width=420,height=720'
		);
		if (!printWindow) {
			setStatus('Print window was blocked. Allow popups for Template Studio.');
			return;
		}

		let printed = false;
		let fallbackTimer: number | undefined;
		const printReceipt = () => {
			if (printed) return;
			printed = true;
			printWindow.removeEventListener('load', printReceipt);
			if (fallbackTimer !== undefined) printWindow.clearTimeout(fallbackTimer);
			waitForImages(printWindow.document)
				.finally(() => {
					printWindow.focus();
					printWindow.print();
				})
				.catch(() => undefined);
		};

		printWindow.addEventListener('load', printReceipt, { once: true });
		preparePrintDocument(printWindow.document, paperWidth);

		const receiptNode = previewFrameRef.current?.firstElementChild?.cloneNode(true);
		if (receiptNode) {
			printWindow.document.body.append(receiptNode);
		}
		fallbackTimer = printWindow.setTimeout(printReceipt, 1500);
	}

	async function sendToRawTcp() {
		if (!rendered || rendered.kind !== 'thermal') {
			setStatus('Raw TCP printing is available for thermal templates only.');
			return;
		}

		try {
			const result = await printRawTcp({
				host: rawTcpHost,
				port: Number(rawTcpPort),
				data: rendered.escposBase64,
			});
			setStatus(`Sent ${result.bytesWritten} ESC/POS bytes to ${rawTcpHost}:${rawTcpPort}.`);
		} catch (error) {
			setStatus(error instanceof Error ? error.message : String(error));
		}
	}

	return (
		<div className="studio-shell">
			<aside className="sidebar">
				<h1>WCPOS Template Studio</h1>
				<p>{status}</p>
				<label>
					Engine
					<select
						value={engineFilter}
						onChange={(event) => setEngineFilter(event.target.value as TemplateEngine | 'all')}
					>
						<option value="all">All non-legacy</option>
						<option value="logicless">Logicless</option>
						<option value="thermal">Thermal</option>
					</select>
				</label>
				<label>
					Template
					<select
						value={selectedTemplate?.id ?? ''}
						onChange={(event) => setSelectedTemplateId(event.target.value)}
					>
						{filteredTemplates.map((template) => (
							<option key={template.id} value={template.id}>
								{template.name} ({template.source})
							</option>
						))}
					</select>
				</label>
				<div className="seed-row">
					<button type="button" onClick={() => setSeed((Math.random() * 0xffffffff) >>> 0)}>
						Shuffle data
					</button>
					<span className="seed-tag" title="Current data seed (paste to reproduce)">
						seed: {formatSeed(randomReceipt.seed)}
					</span>
				</div>
				<label>
					Paper width
					<select
						value={paperWidth}
						onChange={(event) => setPaperWidth(event.target.value as PaperWidth)}
					>
						{paperWidths.map((width) => (
							<option key={width} value={width}>
								{width}
							</option>
						))}
					</select>
				</label>
				<div className="wp-loader">
					<label>
						Store URL
						<input
							value={storeUrl}
							onChange={(event) => setStoreUrl(event.target.value)}
							placeholder="http://localhost:8888"
						/>
					</label>
					<label>
						Template ID
						<input
							value={wpTemplateId}
							onChange={(event) => setWpTemplateId(event.target.value)}
							placeholder="standard-receipt or 123"
						/>
					</label>
					<label>
						Order ID
						<input
							value={wpOrderId}
							onChange={(event) => setWpOrderId(event.target.value)}
							placeholder="latest, 1234, or blank for sample"
						/>
					</label>
					<button type="button" onClick={loadWpTemplate}>
						Fetch preview
					</button>
				</div>
				<div className="print-actions">
					<button type="button" onClick={openPrintDialog} disabled={!rendered}>
						Print dialog
					</button>
					<label>
						Simulator host
						<input value={rawTcpHost} onChange={(event) => setRawTcpHost(event.target.value)} />
					</label>
					<label>
						Simulator port
						<input value={rawTcpPort} onChange={(event) => setRawTcpPort(event.target.value)} />
					</label>
					<button type="button" onClick={sendToRawTcp} disabled={rendered?.kind !== 'thermal'}>
						Send raw ESC/POS
					</button>
				</div>
			</aside>
			<main className="preview-column">
				<h2>{selectedTemplate?.name ?? 'No template selected'}</h2>
				<div
					ref={previewFrameRef}
					className="paper-frame"
					dangerouslySetInnerHTML={{ __html: previewHtml }}
				/>
			</main>
			<aside className="diagnostics">
				<h2>Diagnostics</h2>
				{rendered?.kind === 'logicless' ? (
					<>
						<h3>PHP diagnostic output</h3>
						<div
							className="diagnostic-frame"
							dangerouslySetInnerHTML={{ __html: diagnosticHtml }}
						/>
					</>
				) : null}
				{rendered?.kind === 'thermal' ? (
					<>
						<h3>ESC/POS hex</h3>
						<pre>{rendered.escposHex}</pre>
						<h3>ASCII debug</h3>
						<pre>{rendered.escposAscii}</pre>
					</>
				) : null}
			</aside>
		</div>
	);
}

export function preparePrintDocument(document: Document, paperWidth: PaperWidth): void {
	const pageSize = paperWidth === 'a4' ? 'A4' : `${paperWidth} auto`;
	const meta = document.createElement('meta');
	meta.setAttribute('charset', 'utf-8');

	const title = document.createElement('title');
	title.textContent = 'WCPOS Template Studio Print';

	const style = document.createElement('style');
	style.textContent = `
@page { size: ${pageSize}; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
body { display: flex; justify-content: center; }
`;

	document.head.replaceChildren(meta, title, style);
	document.body.replaceChildren();
}

function waitForImages(document: Document): Promise<void> {
	const pendingImages = Array.from(document.images).filter((image) => !image.complete);
	if (pendingImages.length === 0) return Promise.resolve();

	return Promise.all(
		pendingImages.map(
			(image) =>
				new Promise<void>((resolve) => {
					image.addEventListener('load', () => resolve(), { once: true });
					image.addEventListener('error', () => resolve(), { once: true });
				})
		)
	).then(() => undefined);
}
