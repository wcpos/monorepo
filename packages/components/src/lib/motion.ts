import { Easing } from 'react-native-reanimated';

// Durations already used across the package, centralised.
export const PRESS = 80;
export const OVERLAY_FADE = 150;
export const CROSSFADE = 200;
export const POPOVER_FADE = 200;
export const SHEET_RISE = 200;
export const BEAT = 220;
export const PANEL_SLIDE = 250;
export const PANEL_SLIDE_OUT = 200;
export const PANE = 280;
export const STAMP = 380;

export const EASE = Easing.bezier(0.2, 0.7, 0.2, 1);
export const EASE_BEAT = Easing.bezier(0.2, 0.9, 0.3, 1.1);

type Beat = {
	name: string;
	duration: number;
	easing: typeof EASE | 'linear';
	class: 'beat' | 'structural' | 'waiting';
	waitingPath: boolean;
	exempt?: boolean;
	step?: number;
	cap?: number;
};

// MOTION-RESEARCH.md Table 1: targets for rebuilds, NOT current component timings.
// The four decorative effects are deliberately outside the adopted contract.
export const BEATS = {
	// Decision 29: one settle, never counting up.
	totalSettles: {
		name: 'Total settles',
		duration: BEAT,
		easing: EASE_BEAT,
		class: 'beat',
		waitingPath: true,
	},
	// Rule 6: appears as the amount is typed (180ms in the drawing).
	changeDue: {
		name: 'Change due appears',
		duration: 180,
		easing: EASE,
		class: 'beat',
		waitingPath: true,
	},
	// Decision 10: target the settle budget; shipped 400+400 stays in pulse-row.
	lineAdded: {
		name: 'Line-added highlight',
		duration: BEAT,
		easing: EASE,
		class: 'beat',
		waitingPath: true,
	},
	// Decision 9: the disc itself is the acknowledgement (250ms).
	successDisc: {
		name: 'Success disc lands',
		duration: 250,
		easing: EASE_BEAT,
		class: 'beat',
		waitingPath: true,
	},
	// Register item 7: retain the pop at the 400ms ceiling.
	paidMoment: {
		name: 'Paid moment',
		duration: 400,
		easing: EASE_BEAT,
		class: 'beat',
		waitingPath: true,
	},
	// Target a single stamp-length draw, no delay; shipped 150+450 stays untouched.
	paidTick: {
		name: 'Paid tick draws',
		duration: STAMP,
		easing: EASE,
		class: 'beat',
		waitingPath: true,
	},
	// The ledger arrival in the inventory is 280ms; not a general list animation.
	paymentRow: {
		name: 'A payment row lands',
		duration: PANE,
		easing: EASE_BEAT,
		class: 'beat',
		waitingPath: true,
	},
	// Decision 29: keep the stamp, use the shared overshoot easing.
	stamp: {
		name: 'PAID / VOID stamp slams',
		duration: STAMP,
		easing: EASE_BEAT,
		class: 'beat',
		waitingPath: true,
	},
	// Split drawing: the 400ms ring bounds the concurrent 300ms seat/fill.
	splitLeg: {
		name: 'A split leg is paid',
		duration: 400,
		easing: EASE,
		class: 'beat',
		waitingPath: true,
	},
	// Adopt the library's existing 250ms panel constant, not the drawing's 220ms.
	panelIn: {
		name: 'Side panel in',
		duration: PANEL_SLIDE,
		easing: EASE,
		class: 'structural',
		waitingPath: true,
	},
	// The contract selects 200ms from the drawing's 180/200ms sheet variants.
	sheetRise: {
		name: 'Sheet rise',
		duration: SHEET_RISE,
		easing: EASE,
		class: 'structural',
		waitingPath: true,
	},
	// Reports inherits the drawing's 180ms rise with a shorter distance.
	reportsRise: {
		name: 'Reports sheet rise',
		duration: 180,
		easing: EASE,
		class: 'structural',
		waitingPath: true,
	},
	// Orders' folded pane arrives in 220ms in the drawing.
	ordersPane: {
		name: 'Orders pane in',
		duration: BEAT,
		easing: EASE,
		class: 'structural',
		waitingPath: true,
	},
	// Adopt the existing 200ms popover constant for the shared drop family.
	popoverIn: {
		name: 'Menu / popover / toast / order list in',
		duration: POPOVER_FADE,
		easing: EASE,
		class: 'structural',
		waitingPath: true,
	},
	// Quantity grow is 180ms; its future native twin uses size/opacity.
	quantityGrow: {
		name: 'Quantity expander grows',
		duration: 180,
		easing: EASE,
		class: 'structural',
		waitingPath: true,
	},
	// Products pane stage is explicitly 280ms (2026-09-17 decision).
	productsPane: {
		name: 'Products pane slides',
		duration: PANE,
		easing: EASE,
		class: 'structural',
		waitingPath: true,
	},
	// Drawing's 140ms exit and 10ms step; #340 caps staggered tiles at eight.
	oldTiles: {
		name: 'Old tiles leave',
		duration: 140,
		easing: EASE,
		class: 'structural',
		waitingPath: true,
		step: 10,
		cap: 8,
	},
	// Keep the 22ms step; use BEAT so eight tiles finish in 374ms, not 414ms.
	newTiles: {
		name: 'New tiles land',
		duration: BEAT,
		easing: EASE,
		class: 'structural',
		waitingPath: true,
		step: 22,
		cap: 8,
	},
	// Register crossfade ruling: furniture fades over 200ms, line items do not.
	crossfade: {
		name: 'Crossfade',
		duration: CROSSFADE,
		easing: EASE,
		class: 'structural',
		waitingPath: true,
	},
	// Immediate press feedback uses the drawing's 80ms, not swipe/grip timings.
	press: {
		name: 'Press / swipe / grip',
		duration: PRESS,
		easing: EASE,
		class: 'structural',
		waitingPath: true,
	},
	// Functional indefinite wait: retain the 1s linear revolution under reduce-motion.
	spinner: {
		name: 'Spinner',
		duration: 1000,
		easing: 'linear',
		class: 'waiting',
		waitingPath: true,
		exempt: true,
	},
	// Functional indefinite wait: the drawing's 1.1s cycle, also exempt.
	indeterminateProgress: {
		name: 'Indeterminate progress bar',
		duration: 1100,
		easing: EASE,
		class: 'waiting',
		waitingPath: true,
		exempt: true,
	},
	// The 600ms IS the deliberate hold gesture, not a wait after the gesture.
	holdToVoid: {
		name: 'Hold-to-void fill',
		duration: 600,
		easing: 'linear',
		class: 'waiting',
		waitingPath: false,
		exempt: true,
	},
} satisfies Record<string, Beat>;

// Preserve today's accordion easing and duration; no component adopts new motion yet.
export const WEB_ANIMATIONS = {
	'accordion-down': `accordion-down ${CROSSFADE}ms ease-out`,
	'accordion-up': `accordion-up ${CROSSFADE}ms ease-out`,
};
