import type { RefObject } from 'react';

import { CodePanel } from './CodePanel';

import type { PaperWidth, StudioRenderResult, TemplateEngine } from '../studio-core';

interface StageProps {
	previewFrameRef: RefObject<HTMLDivElement | null>;
	rendered: StudioRenderResult | null;
	previewHtml: string;
	paperWidth: PaperWidth;
	zoom: number;
	templateName?: string;
	templateContent?: string;
	templateEngine?: TemplateEngine;
}

const PAPER_CLASS: Record<PaperWidth, string> = {
	'58mm': 'thermal-58',
	'80mm': 'thermal-80',
	a4: 'a4',
};

const LINE_BREAK_TAGS = new Set(['p', 'div', 'tr', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const NON_VISIBLE_TAGS = new Set(['script', 'style', 'template', 'noscript']);

export function countPreviewLines(html: string): number {
	if (!html || typeof DOMParser === 'undefined') return 0;
	const doc = new DOMParser().parseFromString(html, 'text/html');
	const parts: string[] = [];

	const collectVisibleText = (node: Node): void => {
		if (node.nodeType === Node.TEXT_NODE) {
			parts.push(node.textContent ?? '');
			return;
		}
		if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
			return;
		}

		const tagName =
			node.nodeType === Node.ELEMENT_NODE ? (node as Element).tagName.toLowerCase() : '';
		if (NON_VISIBLE_TAGS.has(tagName)) return;
		if (tagName === 'br') {
			parts.push('\n');
			return;
		}

		for (const child of Array.from(node.childNodes)) {
			collectVisibleText(child);
		}
		if (LINE_BREAK_TAGS.has(tagName)) parts.push('\n');
	};

	collectVisibleText(doc.body);
	const text = parts.join('');
	const normalized = text.replace(/\r/g, '');
	if (normalized === '') return 0;
	return normalized.split('\n').length;
}

function formatBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	return `${(n / 1024).toFixed(1)} KB`;
}

export function Stage({
	previewFrameRef,
	rendered,
	previewHtml,
	paperWidth,
	zoom,
	templateName,
	templateContent,
	templateEngine,
}: StageProps) {
	const lineCount = countPreviewLines(previewHtml);
	const sizeLabel =
		rendered?.kind === 'thermal'
			? `${formatBytes(rendered.escposBytes.length)} ESC/POS`
			: previewHtml
				? `${formatBytes(new Blob([previewHtml]).size)} HTML`
				: '';
	const paperLabel = paperWidth === 'a4' ? 'A4' : paperWidth;
	const transform = zoom === 100 ? undefined : `scale(${zoom / 100})`;

	return (
		<main className="stage" aria-label={templateName ?? 'Preview'}>
			<div className="stage-preview">
				{rendered ? (
					<div
						ref={previewFrameRef}
						className={`paper-frame ${PAPER_CLASS[paperWidth]}`}
						style={transform ? { transform } : undefined}
						dangerouslySetInnerHTML={{ __html: previewHtml }}
					/>
				) : (
					<div className="stage-empty">Select a template to render a preview.</div>
				)}
			</div>
			{rendered ? (
				<div className="stage-status" aria-live="polite">
					<span>{paperLabel}</span>
					<span className="dot">·</span>
					<span>{lineCount} lines</span>
					{sizeLabel ? (
						<>
							<span className="dot">·</span>
							<span>{sizeLabel}</span>
						</>
					) : null}
				</div>
			) : null}
			<CodePanel content={templateContent} engine={templateEngine} templateName={templateName} />
		</main>
	);
}
