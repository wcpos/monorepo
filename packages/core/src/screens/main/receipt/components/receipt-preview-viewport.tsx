import * as React from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, View } from 'react-native';

import { Text } from '@wcpos/components/text';

import {
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
	zoomInLabel: string;
	zoomOutLabel: string;
	testID?: string;
}

export function ReceiptPreviewViewport({
	children,
	paperWidth,
	zoomInLabel,
	zoomOutLabel,
	testID,
}: ReceiptPreviewViewportProps) {
	const { width: paperW, height: paperH } = PAPER_DIMENSIONS[paperWidth];
	const [zoom, setZoom] = React.useState<PreviewZoom>(100);
	const autoFitDoneRef = React.useRef(false);

	React.useEffect(() => {
		autoFitDoneRef.current = false;
	}, [paperW, paperH]);

	const handleLayout = React.useCallback(
		(event: LayoutChangeEvent) => {
			if (autoFitDoneRef.current) return;
			const { width, height } = event.nativeEvent.layout;
			const availW = width - CANVAS_PAD_PX * 2;
			const availH = height - CANVAS_PAD_PX * 2;
			if (availW <= 0 || availH <= 0) return;
			autoFitDoneRef.current = true;
			setZoom(pickAutoFitZoom(paperW, paperH, availW, availH));
		},
		[paperW, paperH]
	);

	const scale = zoom / 100;
	const currentIndex = PREVIEW_ZOOM_STEPS.indexOf(zoom);
	const canZoomOut = currentIndex > 0;
	const canZoomIn = currentIndex < PREVIEW_ZOOM_STEPS.length - 1;
	const stepZoom = (delta: number) => {
		const next = Math.max(0, Math.min(PREVIEW_ZOOM_STEPS.length - 1, currentIndex + delta));
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
					accessibilityLabel={`Zoom ${zoom}%`}
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
				contentContainerStyle={{ padding: CANVAS_PAD_PX, alignItems: 'center' }}
			>
				<View
					testID={testID ? `${testID}-canvas-frame` : undefined}
					style={{
						width: paperW * scale,
						height: paperH * scale,
						overflow: 'hidden',
						backgroundColor: 'white',
					}}
				>
					<View
						testID={testID ? `${testID}-canvas` : undefined}
						style={{
							width: paperW,
							height: paperH,
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
