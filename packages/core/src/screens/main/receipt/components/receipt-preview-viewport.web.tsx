import * as React from 'react';

import {
	DEFAULT_RECEIPT_PREVIEW_ZOOMS,
	getDefaultReceiptPreviewZoom,
	isReceiptPreviewZoom,
} from './receipt-preview-viewport-utils';

export { DEFAULT_RECEIPT_PREVIEW_ZOOMS, getDefaultReceiptPreviewZoom };

interface ReceiptPreviewViewportProps {
	children: React.ReactNode;
	defaultZoom: number;
	zoomOptions?: readonly number[];
	label: string;
	testID?: string;
}

export function ReceiptPreviewViewport({
	children,
	defaultZoom,
	zoomOptions = DEFAULT_RECEIPT_PREVIEW_ZOOMS,
	label,
	testID,
}: ReceiptPreviewViewportProps) {
	const fallbackZoom = zoomOptions[0] ?? DEFAULT_RECEIPT_PREVIEW_ZOOMS[0];
	const normalizedDefaultZoom = isReceiptPreviewZoom(defaultZoom, zoomOptions)
		? defaultZoom
		: fallbackZoom;
	const [zoom, setZoom] = React.useState(normalizedDefaultZoom);

	// Reset zoom when the selected receipt template changes its type-appropriate default.
	React.useEffect(() => {
		setZoom(normalizedDefaultZoom);
	}, [normalizedDefaultZoom]);

	const scale = zoom / 100;

	return (
		<div data-testid={testID} className="flex min-h-0 flex-1 flex-col gap-2">
			<div className="flex items-center gap-2" aria-label={label}>
				<span className="text-muted-foreground text-sm">{label}</span>
				<div className="flex gap-1">
					{zoomOptions.map((option) => {
						const active = option === zoom;
						return (
							<button
								key={option}
								type="button"
								aria-pressed={active}
								className={`rounded-md border px-2 py-1 text-sm ${
									active ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground'
								}`}
								onClick={() => setZoom(option)}
							>
								{option}%
							</button>
						);
					})}
				</div>
			</div>
			<div className="bg-muted min-h-0 flex-1 overflow-auto rounded-md border p-3">
				<div
					data-testid={testID ? `${testID}-canvas` : undefined}
					className="flex min-h-[640px] flex-col"
					style={{
						transform: `scale(${scale})`,
						transformOrigin: 'top left',
						width: `${100 / scale}%`,
						height: `${100 / scale}%`,
					}}
				>
					{children}
				</div>
			</div>
		</div>
	);
}
