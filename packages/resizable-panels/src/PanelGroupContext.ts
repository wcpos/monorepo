import React from 'react';

import { GestureUpdateEvent, PanGestureHandlerEventPayload } from 'react-native-gesture-handler';
import { SharedValue } from 'react-native-reanimated';

import { PanelConstraints, PanelData } from './Panel';

export type DragState = {
	dragHandleId: string;
	initialLayout: number[];
	pivotIndices: [number, number];
	containerSizePx: number;
};

export type TPanelGroupContext = {
	collapsePanel: (panelData: PanelData) => void;
	direction: 'horizontal' | 'vertical';
	dragState: SharedValue<DragState | null>;
	expandPanel: (panelData: PanelData, minSizeOverride?: number) => void;
	getPanelSize: (panelData: PanelData) => number;
	getPanelIndex: (panelData: PanelData) => number;
	groupId: string;
	isPanelCollapsed: (panelData: PanelData) => boolean;
	isPanelExpanded: (panelData: PanelData) => boolean;
	reevaluatePanelConstraints: (panelData: PanelData, prevConstraints: PanelConstraints) => void;
	registerPanel: (panelData: PanelData) => void;
	registerHandle: (handleId: string) => [number, number];
	// registerResizeHandle: () => (translationX: number, translationY: number) => void;
	resizePanel: (panelData: PanelData, size: number) => void;
	startDragging: (dragHandleId: string) => void;
	stopDragging: () => void;
	unregisterPanel: (panelData: PanelData) => void;
	layoutShared: SharedValue<number[]>;
	panelIdsShared: SharedValue<string[]>;
	updateLayout: (handleId: string, e: GestureUpdateEvent<PanGestureHandlerEventPayload>) => void;
};

export const PanelGroupContext = React.createContext<TPanelGroupContext | null>(null);
