import React from 'react';

import { displayPreviewUrl } from '../studio-api';

import type { DisplayState } from '../studio-api';

interface DisplayStageProps {
	siteOrigin: string;
	templateId: string | number;
}

const DISPLAY_WIDTH = 1280;
const DISPLAY_HEIGHT = 800;
const DISPLAY_STATES: readonly { state: DisplayState; label: string }[] = [
	{ state: 'idle', label: 'Idle' },
	{ state: 'cart', label: 'Cart' },
	{ state: 'cart.empty', label: 'Cart empty' },
	{ state: 'payment.started', label: 'Payment started' },
	{ state: 'payment.approved', label: 'Payment approved' },
	{ state: 'payment.declined', label: 'Payment declined' },
	{ state: 'payment.complete', label: 'Payment complete' },
];

/** Renders a responsive customer-display iframe and its preview-state controls. */
export function DisplayStage({ siteOrigin, templateId }: DisplayStageProps) {
	const [state, setState] = React.useState<DisplayState>('cart');
	const [scale, setScale] = React.useState(1);
	const previewRef = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		// The iframe has a fixed display resolution, so observe the stage to keep it fully visible.
		const preview = previewRef.current;
		if (!preview || typeof ResizeObserver === 'undefined') return;
		const updateScale = () => {
			const availableWidth = Math.max(0, preview.clientWidth - 48);
			const availableHeight = Math.max(0, preview.clientHeight - 48);
			if (availableWidth && availableHeight) {
				setScale(Math.min(1, availableWidth / DISPLAY_WIDTH, availableHeight / DISPLAY_HEIGHT));
			}
		};
		const observer = new ResizeObserver(updateScale);
		observer.observe(preview);
		// eslint-disable-next-line react-you-might-not-need-an-effect/no-initialize-state -- Initial measurement complements future observer callbacks.
		updateScale();
		return () => observer.disconnect();
	}, []);

	return (
		<main className="stage display-stage" aria-label="Customer display preview">
			<div className="display-state-controls" aria-label="Display state">
				<div className="display-state-picker">
					{DISPLAY_STATES.map((option) => (
						<button
							key={option.state}
							type="button"
							aria-pressed={state === option.state}
							onClick={() => setState(option.state)}
						>
							{option.label}
						</button>
					))}
				</div>
				<p>Previews use the WordPress login in this browser.</p>
			</div>
			<div ref={previewRef} className="display-preview">
				<div
					className="display-frame-wrap"
					style={{ width: DISPLAY_WIDTH * scale, height: DISPLAY_HEIGHT * scale }}
				>
					<iframe
						title="Customer display preview"
						className="display-frame"
						width={DISPLAY_WIDTH}
						height={DISPLAY_HEIGHT}
						src={displayPreviewUrl(siteOrigin, templateId, state)}
						style={{ transform: `scale(${scale})` }}
					/>
				</div>
			</div>
		</main>
	);
}
