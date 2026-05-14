import * as React from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, View } from 'react-native';

import { Text } from '@wcpos/components/text';

import {
	type ContentSize,
	getReceiptPreviewPaperWidth,
	PAPER_DIMENSIONS,
	pickAutoFitZoom,
	PREVIEW_ZOOM_STEPS,
	type PreviewPaperWidth,
	type PreviewZoom,
} from './receipt-preview-viewport-utils';

export { getReceiptPreviewPaperWidth, PAPER_DIMENSIONS, PREVIEW_ZOOM_STEPS };

const CANVAS_PAD_PX = 12;

interface ReceiptPreviewViewportProps {
	children: React.ReactNode;
	paperWidth: PreviewPaperWidth;
	/** Measured size of the rendered document; paper dimensions are used until it is known. */
	contentSize?: ContentSize | null;
	zoomInLabel: string;
	zoomOutLabel: string;
	testID?: string;
}

export function ReceiptPreviewViewport({
	children,
	paperWidth,
	contentSize,
	zoomInLabel,
	zoomOutLabel,
	testID,
}: ReceiptPreviewViewportProps) {
	const fallback = PAPER_DIMENSIONS[paperWidth];
	const canvasW = contentSize?.width ?? fallback.width;
	const canvasH = contentSize?.height ?? fallback.height;
	const [zoom, setZoom] = React.useState<PreviewZoom>(100);
	const availSizeRef = React.useRef<{ width: number; height: number } | null>(null);
	const userPickedRef = React.useRef(false);

	const applyAutoFit = React.useCallback(() => {
		if (userPickedRef.current) return;
		const avail = availSizeRef.current;
		if (!avail) return;
		const availW = avail.width - CANVAS_PAD_PX * 2;
		const availH = avail.height - CANVAS_PAD_PX * 2;
		if (availW <= 0 || availH <= 0) return;
		setZoom(pickAutoFitZoom(canvasW, canvasH, availW, availH));
	}, [canvasW, canvasH]);

	const handleLayout = React.useCallback(
		(event: LayoutChangeEvent) => {
			availSizeRef.current = event.nativeEvent.layout;
			applyAutoFit();
		},
		[applyAutoFit]
	);

	// Re-fit when the measured content size changes — the container's onLayout
	// only fires for its own layout, not for content-driven canvas changes.
	React.useEffect(() => {
		applyAutoFit();
	}, [applyAutoFit]);

	const scale = zoom / 100;
	const currentIndex = PREVIEW_ZOOM_STEPS.indexOf(zoom);
	const canZoomOut = currentIndex > 0;
	const canZoomIn = currentIndex < PREVIEW_ZOOM_STEPS.length - 1;
	const stepZoom = (delta: number) => {
		const next = Math.max(0, Math.min(PREVIEW_ZOOM_STEPS.length - 1, currentIndex + delta));
		userPickedRef.current = true;
		setZoom(PREVIEW_ZOOM_STEPS[next]);
	};

	return (
		<View
			testID={testID}
			onLayout={handleLayout}
			className="bg-muted relative min-h-0 flex-1 rounded-md border"
		>
			<View
				testID={testID ? `${testID}-zoom-controls` : undefined}
				className="bg-background/95 absolute top-2 right-2 z-10 flex-row items-stretch overflow-hidden rounded-md border shadow-sm"
			>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={zoomOutLabel}
					accessibilityState={{ disabled: !canZoomOut }}
					disabled={!canZoomOut}
					onPress={() => stepZoom(-1)}
					className="h-7 w-7 items-center justify-center"
				>
					<Text
						className={
							canZoomOut ? 'text-foreground text-base' : 'text-muted-foreground/50 text-base'
						}
					>
						−
					</Text>
				</Pressable>
				<View
					testID={testID ? `${testID}-zoom-value` : undefined}
					accessibilityRole="text"
					className="min-w-[44px] items-center justify-center border-r border-l px-2"
				>
					<Text className="text-foreground text-xs tabular-nums">{zoom}%</Text>
				</View>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={zoomInLabel}
					accessibilityState={{ disabled: !canZoomIn }}
					disabled={!canZoomIn}
					onPress={() => stepZoom(1)}
					className="h-7 w-7 items-center justify-center"
				>
					<Text
						className={
							canZoomIn ? 'text-foreground text-base' : 'text-muted-foreground/50 text-base'
						}
					>
						+
					</Text>
				</Pressable>
			</View>
			<ScrollView
				testID={testID ? `${testID}-scroll-area` : undefined}
				className="min-h-0 flex-1"
				contentContainerStyle={{ padding: CANVAS_PAD_PX, alignItems: 'center' }}
			>
				<View
					testID={testID ? `${testID}-canvas-frame` : undefined}
					style={{
						width: canvasW * scale,
						height: canvasH * scale,
						overflow: 'hidden',
						backgroundColor: 'white',
					}}
				>
					<View
						testID={testID ? `${testID}-canvas` : undefined}
						style={{
							width: canvasW,
							height: canvasH,
							transform: [{ scale }],
							transformOrigin: 'top left',
						}}
					>
						{children}
					</View>
				</View>
			</ScrollView>
		</View>
	);
}
