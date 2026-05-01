import { paperWidths } from '../studio-api';

import type { PaperWidth } from '../studio-core';

interface ToolbarProps {
	paperWidth: PaperWidth;
	onPaperWidthChange: (width: PaperWidth) => void;
	zoom: number;
	onZoomChange: (zoom: number) => void;
}

const ZOOM_STEP = 10;
const ZOOM_MIN = 50;
const ZOOM_MAX = 200;

export function Toolbar({ paperWidth, onPaperWidthChange, zoom, onZoomChange }: ToolbarProps) {
	return (
		<header className="studio-toolbar" role="toolbar" aria-label="Canvas controls">
			<div className="brand">
				<span className="brand-mark" aria-hidden="true" />
				<span>Template Studio</span>
			</div>
			<div className="toolbar-spacer" />
			<div className="segmented" role="radiogroup" aria-label="Paper size">
				{paperWidths.map((width) => (
					<button
						key={width}
						type="button"
						aria-pressed={paperWidth === width}
						onClick={() => onPaperWidthChange(width)}
					>
						{width === 'a4' ? 'A4' : width}
					</button>
				))}
			</div>
			<div className="zoom-control" aria-label="Zoom">
				<button
					type="button"
					aria-label="Zoom out"
					onClick={() => onZoomChange(Math.max(ZOOM_MIN, zoom - ZOOM_STEP))}
					disabled={zoom <= ZOOM_MIN}
				>
					−
				</button>
				<span aria-live="polite">{zoom}%</span>
				<button
					type="button"
					aria-label="Zoom in"
					onClick={() => onZoomChange(Math.min(ZOOM_MAX, zoom + ZOOM_STEP))}
					disabled={zoom >= ZOOM_MAX}
				>
					+
				</button>
			</div>
		</header>
	);
}
