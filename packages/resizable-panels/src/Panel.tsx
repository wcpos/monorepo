import React from 'react';
import { StyleProp, ViewProps, ViewStyle } from 'react-native';

import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useUniqueId } from './hooks/useUniqueId';
import { PanelGroupContext } from './PanelGroupContext';

export type PanelOnCollapse = () => void;
export type PanelOnExpand = () => void;
export type PanelOnResize = (size: number, prevSize: number | undefined) => void;

export type PanelCallbacks = {
	onCollapse?: PanelOnCollapse;
	onExpand?: PanelOnExpand;
	onResize?: PanelOnResize;
};

export type PanelConstraints = {
	collapsedSize?: number;
	collapsible?: boolean;
	defaultSize?: number;
	maxSize?: number;
	minSize?: number;
};

export type PanelData = {
	callbacks: PanelCallbacks;
	constraints: PanelConstraints;
	id: string;
	idIsFromProps: boolean;
	order?: number;
};

export type ImperativePanelHandle = {
	collapse: () => void;
	expand: (minSize?: number) => void;
	getId(): string;
	getSize(): number;
	isCollapsed: () => boolean;
	isExpanded: () => boolean;
	resize: (size: number) => void;
};

export type PanelProps = ViewProps & {
	collapsedSize?: number;
	collapsible?: boolean;
	defaultSize?: number;
	id?: string;
	maxSize?: number;
	minSize?: number;
	onCollapse?: PanelOnCollapse;
	onExpand?: PanelOnExpand;
	onResize?: PanelOnResize;
	order?: number;
	style?: StyleProp<ViewStyle>;
	children?: React.ReactNode;
	ref?: React.Ref<ImperativePanelHandle>;
};

export function Panel({
	ref,
	children,
	collapsedSize,
	collapsible,
	defaultSize,
	id: idFromProps,
	maxSize,
	minSize,
	onCollapse,
	onExpand,
	onResize,
	order,
	style: styleFromProps,
	...viewProps
}: PanelProps) {
	const context = React.useContext(PanelGroupContext);
	if (context === null) {
		throw new Error(`<Panel> must be rendered inside a <PanelGroup>`);
	}

	const {
		collapsePanel,
		expandPanel,
		getPanelSize,
		isPanelCollapsed,
		reevaluatePanelConstraints,
		registerPanel,
		unregisterPanel,
		resizePanel,
		layoutShared,
		panelIdsShared,
		dragState,
	} = context;

	const panelId = useUniqueId(idFromProps);

	const panelDataRef = React.useRef<PanelData>({
		callbacks: {
			onCollapse,
			onExpand,
			onResize,
		},
		constraints: {
			collapsedSize,
			collapsible,
			defaultSize,
			maxSize,
			minSize,
		},
		id: panelId,
		idIsFromProps: idFromProps !== undefined,
		order,
	});

	// Sync props→ref and re-evaluate constraints if needed
	React.useLayoutEffect(() => {
		const { callbacks, constraints } = panelDataRef.current;
		const prevConstraints = { ...constraints };

		panelDataRef.current.id = panelId;
		panelDataRef.current.idIsFromProps = idFromProps !== undefined;
		panelDataRef.current.order = order;

		callbacks.onCollapse = onCollapse;
		callbacks.onExpand = onExpand;
		callbacks.onResize = onResize;

		constraints.collapsedSize = collapsedSize;
		constraints.collapsible = collapsible;
		constraints.defaultSize = defaultSize;
		constraints.maxSize = maxSize;
		constraints.minSize = minSize;

		if (
			prevConstraints.collapsedSize !== constraints.collapsedSize ||
			prevConstraints.collapsible !== constraints.collapsible ||
			prevConstraints.maxSize !== constraints.maxSize ||
			prevConstraints.minSize !== constraints.minSize
		) {
			reevaluatePanelConstraints(panelDataRef.current, prevConstraints);
		}
	});

	// Register on mount, unregister on unmount
	React.useLayoutEffect(() => {
		const panelData = panelDataRef.current;
		registerPanel(panelData);
		return () => {
			unregisterPanel(panelData);
		};
	}, [order, panelId, registerPanel, unregisterPanel]);

	// Expose imperative methods
	React.useImperativeHandle(
		ref,
		() => ({
			collapse: () => {
				collapsePanel(panelDataRef.current);
			},
			expand: (minSize?: number) => {
				expandPanel(panelDataRef.current, minSize);
			},
			getId() {
				return panelId;
			},
			getSize() {
				return getPanelSize(panelDataRef.current);
			},
			isCollapsed() {
				return isPanelCollapsed(panelDataRef.current);
			},
			isExpanded() {
				return !isPanelCollapsed(panelDataRef.current);
			},
			resize: (size: number) => {
				resizePanel(panelDataRef.current, size);
			},
		}),
		[collapsePanel, expandPanel, getPanelSize, isPanelCollapsed, panelId, resizePanel]
	);

	const animatedStyle = useAnimatedStyle(() => {
		const layout = layoutShared.value;
		const panelIds = panelIdsShared.value;
		const currentDragState = dragState.value;

		const panelIndex = panelIds.indexOf(panelId);

		const size = panelIndex > -1 ? layout[panelIndex] : undefined;

		let flexGrowValue: number;
		const precision = 3;

		if (size == null) {
			if (defaultSize != null) {
				flexGrowValue = Number(defaultSize.toPrecision(precision));
			} else {
				flexGrowValue = 1;
			}
		} else if (panelIds.length === 1) {
			flexGrowValue = 1;
		} else {
			flexGrowValue = Number(size.toPrecision(precision));
		}

		return {
			flexBasis: 0,
			flexGrow: flexGrowValue,
			flexShrink: 1,
			overflow: 'hidden',
			pointerEvents: currentDragState !== null ? 'none' : 'auto',
		};
	}, [panelId, defaultSize]);

	return (
		<Animated.View {...viewProps} style={[animatedStyle, styleFromProps]}>
			{children}
		</Animated.View>
	);
}
