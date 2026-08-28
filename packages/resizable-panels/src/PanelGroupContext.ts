import React from 'react';

import type { SharedValue } from 'react-native-reanimated';
import type { PanelGroupModel } from './model/PanelGroupModel';
import type { Direction } from './types';

export type DragState = { dragHandleId: string };

export type TPanelGroupContext = {
	model: PanelGroupModel;
	direction: Direction;
	groupId: string;
	dragState: SharedValue<DragState | null>;
	layoutShared: SharedValue<number[]>;
	panelIdsShared: SharedValue<string[]>;
	beginDrag: (handleId: string) => void;
	drag: (translationX: number, translationY: number) => void;
	endDrag: () => void;
};

export const PanelGroupContext = React.createContext<TPanelGroupContext | null>(null);
