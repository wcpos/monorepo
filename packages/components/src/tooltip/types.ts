import type * as TooltipPrimitive from '@rn-primitives/tooltip';
import type { ForceMountable, PressableRef } from '@rn-primitives/types';

interface TooltipProps {
	children: React.ReactNode;
	/**
	 * On native, tooltips are disabled by default (just passes through children).
	 * Set to true to enable press-to-show tooltip behavior on native.
	 * @default false
	 */
	showOnNative?: boolean;
	/**
	 * Platform: WEB ONLY
	 * @default 700
	 */
	delayDuration?: number;
}

interface TooltipTriggerProps extends Omit<TooltipPrimitive.TriggerProps, 'ref'> {
	children: React.ReactNode;
}

interface TooltipContentProps extends Omit<TooltipPrimitive.ContentProps, 'ref'> {
	portalHost?: string;
}

interface TooltipRootProps {
	onOpenChange?: (open: boolean) => void;
	/**
	 * Platform: WEB ONLY
	 * @default 700
	 */
	delayDuration?: number;
	/**
	 * Platform: WEB ONLY
	 * @default 300
	 */
	skipDelayDuration?: number;
	/**
	 * Platform: WEB ONLY
	 */
	disableHoverableContent?: boolean;
}

interface TooltipPortalProps extends ForceMountable {
	children: React.ReactNode;
	/**
	 * Platform: NATIVE ONLY
	 */
	hostName?: string;
	/**
	 * Platform: WEB ONLY
	 */
	container?: HTMLElement | null | undefined;
}

interface TooltipOverlayProps extends ForceMountable {
	closeOnPress?: boolean;
}

interface TooltipTriggerRef extends PressableRef {
	open: () => void;
	close: () => void;
}

export type {
	TooltipProps,
	TooltipTriggerProps,
	TooltipContentProps,
	TooltipOverlayProps,
	TooltipPortalProps,
	TooltipRootProps,
	TooltipTriggerRef,
};
