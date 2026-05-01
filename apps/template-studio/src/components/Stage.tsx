import type { RefObject } from 'react';

import type { PaperWidth, StudioRenderResult } from '../studio-core';

interface StageProps {
	previewFrameRef: RefObject<HTMLDivElement | null>;
	rendered: StudioRenderResult | null;
	previewHtml: string;
	paperWidth: PaperWidth;
	zoom: number;
	templateName?: string;
}

const PAPER_CLASS: Record<PaperWidth, string> = {
	'58mm': 'thermal-58',
	'80mm': 'thermal-80',
	a4: 'a4',
};

function countLines(html: string): number {
	if (!html) return 0;
	const text = html
		.replace(/<br\s*\/?>(?!\s*<)/gi, '\n')
		.replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
		.replace(/<[^>]+>/g, '');
	const trimmed = text.replace(/\r/g, '').trim();
	if (!trimmed) return 0;
	return trimmed.split(/\n+/).length;
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
}: StageProps) {
	const lineCount = countLines(previewHtml);
	const sizeLabel =
		rendered?.kind === 'thermal'
			? `${formatBytes(rendered.escposBytes.length)} ESC/POS`
			: previewHtml
				? `${formatBytes(new Blob([previewHtml]).size)} HTML`
				: '';
	const showByteCount = rendered?.kind === 'thermal';
	const paperLabel = paperWidth === 'a4' ? 'A4' : paperWidth;
	const transform = zoom === 100 ? undefined : `scale(${zoom / 100})`;

	return (
		<main className="stage" aria-label={templateName ?? 'Preview'}>
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
			{rendered ? (
				<div className="spec-pill" aria-live="polite">
					<span>{paperLabel}</span>
					<span className="dot">·</span>
					<span>{lineCount} lines</span>
					{showByteCount ? (
						<>
							<span className="dot">·</span>
							<span>{sizeLabel}</span>
						</>
					) : sizeLabel ? (
						<>
							<span className="dot">·</span>
							<span>{sizeLabel}</span>
						</>
					) : null}
				</div>
			) : null}
		</main>
	);
}
