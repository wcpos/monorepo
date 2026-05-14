'use dom';

import * as React from 'react';

import { renderPreview } from '../encoder/render-preview';
import { encodeThermalTemplate } from '../renderer';
import { rasterizeReceiptElement, stripThermalControlNodesForRaster } from './rasterize-element';

import type { DOMProps } from 'expo/dom';

export interface RasterEncodeOptions {
	language: 'esc-pos' | 'star-prnt' | 'star-line';
	columns: number;
	printerModel?: string;
	emitEscPrintMode: boolean;
}

interface ReceiptRasterizerProps {
	dom?: DOMProps;
	/** Job id — changing it triggers a new rasterize+encode pass. */
	jobId: string;
	/** Original thermal template XML (built-in default or a custom template). */
	templateXml: string;
	/** Receipt data (canonical or pre-canonical — renderPreview normalises it). */
	receiptData: Record<string, unknown>;
	/** Printer dot budget for the paper width. */
	maxWidthDots: number;
	/** Paper-frame CSS class controlling capture width. */
	paperFrameClass: 'thermal-58' | 'thermal-80';
	encodeOptions: RasterEncodeOptions;
	/** Called with base64-encoded ESC/POS bytes on success. */
	onEncoded: (jobId: string, base64Bytes: string) => Promise<void>;
	/** Called with an error message on failure. */
	onError: (jobId: string, message: string) => Promise<void>;
}

const PAPER_FRAME_STYLE_ID = 'wcpos-receipt-rasterizer-paper-frame';

/**
 * The `paper-frame` / `thermal-58` / `thermal-80` rules live in template-studio's
 * `apps/template-studio/src/styles.css`. This component runs inside an Expo
 * `'use dom'` webview, which ships none of the app CSS, so the rules are ported
 * here (CSS vars resolved to concrete values, cosmetic background/box-shadow
 * dropped — they don't affect the raster). Without these the paper frame would
 * have no width constraint and the capture geometry would be wrong.
 */
function ensurePaperFrameStyles(): void {
	if (document.getElementById(PAPER_FRAME_STYLE_ID)) return;
	const style = document.createElement('style');
	style.id = PAPER_FRAME_STYLE_ID;
	style.textContent = `
.paper-frame {
  font-family: ui-monospace, 'SFMono-Regular', 'Menlo', monospace;
  color: #1c1814;
}
.paper-frame.thermal-58 { width: 58mm; }
.paper-frame.thermal-80 { width: 80mm; }
.paper-frame.thermal-58, .paper-frame.thermal-80 {
  padding: 4mm 2mm;
  font-size: 11.5px;
}
.paper-frame.thermal-58 > div,
.paper-frame.thermal-80 > div {
  box-shadow: none !important;
  margin: 0 !important;
  padding: 0 !important;
  background: transparent !important;
  width: 100% !important;
}
.paper-frame.thermal-58 > div { font-size: 10.5px !important; }
.paper-frame.thermal-80 > div { font-size: 10px !important; }
`;
	document.head.append(style);
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

export default function ReceiptRasterizer({
	jobId,
	templateXml,
	receiptData,
	maxWidthDots,
	paperFrameClass,
	encodeOptions,
	onEncoded,
	onError,
}: ReceiptRasterizerProps) {
	React.useEffect(() => {
		let cancelled = false;
		(async () => {
			let host: HTMLDivElement | null = null;
			try {
				// 0. Ensure the paper-frame CSS (ported from template-studio) is present.
				ensurePaperFrameStyles();

				// 1. Render the template (control nodes stripped) to HTML.
				const strippedXml = stripThermalControlNodesForRaster(templateXml);
				const { html } = renderPreview({
					template: strippedXml,
					engine: 'thermal',
					data: receiptData,
				});

				// 2. Mount it off-screen inside a paper frame.
				host = document.createElement('div');
				host.style.position = 'absolute';
				host.style.left = '-10000px';
				host.style.top = '0';
				const frame = document.createElement('div');
				frame.className = `paper-frame ${paperFrameClass}`;
				frame.innerHTML = html;
				host.append(frame);
				document.body.append(host);

				// 3. Capture to a bitmap.
				const rasterImage = await rasterizeReceiptElement({
					receiptNode: frame,
					maxWidth: maxWidthDots,
					hostDocument: document,
				});

				// 4. Encode the ORIGINAL template + raster image to ESC/POS bytes.
				//    renderEscpos short-circuits to the image and re-appends trailing
				//    cut/feed/drawer from the original template's AST.
				const bytes = encodeThermalTemplate(templateXml, receiptData, {
					...encodeOptions,
					fullReceiptRasterImage: rasterImage,
				});

				if (!cancelled) await onEncoded(jobId, bytesToBase64(bytes));
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				if (!cancelled) await onError(jobId, message);
			} finally {
				host?.remove();
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [
		jobId,
		templateXml,
		receiptData,
		maxWidthDots,
		paperFrameClass,
		encodeOptions,
		onEncoded,
		onError,
	]);

	return null;
}
