export const CHANGE_SIGNAL_IDLE_AFTER_MS = 10 * 60_000;
export const CHANGE_SIGNAL_DECAY_STEPS_MS = [30_000, 60_000] as const;

export type ChangeSignalDecayLevel = 0 | 1 | 2;

export function nextChangeSignalDecayLevel(input: {
	idleForMs: number;
	currentLevel: ChangeSignalDecayLevel;
}): ChangeSignalDecayLevel {
	if (input.idleForMs < CHANGE_SIGNAL_IDLE_AFTER_MS) return 0;
	return Math.min(input.currentLevel + 1, 2) as ChangeSignalDecayLevel;
}

export function changeSignalDelayMs(input: {
	tierMs: number;
	level: ChangeSignalDecayLevel;
	random: () => number;
}): number {
	const base =
		input.level === 0
			? input.tierMs
			: Math.max(input.tierMs, CHANGE_SIGNAL_DECAY_STEPS_MS[input.level - 1]);
	return Math.round(base * (0.8 + 0.4 * input.random()));
}
