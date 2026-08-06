export const CHANGE_SIGNAL_IDLE_AFTER_MS = 10 * 60_000;
export const CHANGE_SIGNAL_DECAY_STEPS_MS = [30_000, 60_000] as const;

export type ChangeSignalDecayLevel = 0 | 1 | 2;

/**
 * Top of the server-pressure ladder (#846). The ladder doubles, so this is six
 * steps from ×1; the tier's own ceiling below is what actually stops the climb
 * for every tier we ship.
 *
 * Sized for the FASTEST cadence `reconfigure` accepts, not the fastest preset:
 * a Custom 5s setting needs ×64 to reach the 5-minute ceiling (5s × 32 tops out
 * at 160s, which would leave a distressed server taking nearly twice the polls
 * the ceiling promises). No slower tier gets near this cap — they hit their own
 * ceiling first and stop.
 */
export const CHANGE_SIGNAL_PRESSURE_MAX_MULTIPLIER = 64;

/**
 * How slow the change-signal poll may get under server pressure.
 *
 * Five minutes is the gentlest cadence WCPOS ships (the Eco preset), so it is
 * the natural wall — except for a merchant who already chose something SLOWER
 * than Eco through Custom, where five minutes would be no back-off at all. Hence
 * "five minutes, or double your own setting, whichever is further out": every
 * preset gets real headroom and nobody's explicit choice is quietly ignored.
 *
 * The one thing allowed past this ceiling is a server's own `Retry-After` — when
 * the host names a pause, the host wins.
 */
export function changeSignalPressureCeilingMs(tierMs: number): number {
	return Math.max(300_000, tierMs * 2);
}

/**
 * The ladder's top for a given tier: the first doubling that reaches the tier's
 * ceiling. Capping here (rather than only clamping the interval) means every
 * rung buys real slowdown — otherwise a 60s tier would keep climbing to ×32 with
 * no effect beyond ×8 and then need five wasted recovery steps to climb back.
 */
export function maxChangeSignalPressureMultiplier(tierMs: number): number {
	const ceilingMs = changeSignalPressureCeilingMs(tierMs);
	let multiplier = 1;
	while (multiplier < CHANGE_SIGNAL_PRESSURE_MAX_MULTIPLIER && tierMs * multiplier < ceilingMs) {
		multiplier *= 2;
	}
	return multiplier;
}

export function nextChangeSignalDecayLevel(input: {
	idleForMs: number;
	currentLevel: ChangeSignalDecayLevel;
}): ChangeSignalDecayLevel {
	if (input.idleForMs < CHANGE_SIGNAL_IDLE_AFTER_MS) return 0;
	return Math.min(input.currentLevel + 1, 2) as ChangeSignalDecayLevel;
}

/**
 * The steady interval a tier polls at, before jitter — idle decay COMPOSED with
 * the server-pressure multiplier.
 *
 * The two adaptations MULTIPLY rather than one replacing the other, because they
 * answer different questions and both answer "poll less": idle decay says nobody
 * is watching this till, pressure says the merchant's server is struggling. A
 * till that is both idle and talking to a sick server should be the quietest
 * thing on the network, so the effects stack. Idle decay can only ever LENGTHEN
 * the tier (it takes the max of tier and decay step), and pressure then
 * multiplies whatever that produced, up to the tier's ceiling.
 */
export function changeSignalSteadyIntervalMs(input: {
	tierMs: number;
	level: ChangeSignalDecayLevel;
	pressureMultiplier?: number;
}): number {
	const idleBase =
		input.level === 0
			? input.tierMs
			: Math.max(input.tierMs, CHANGE_SIGNAL_DECAY_STEPS_MS[input.level - 1]);
	const multiplier = Math.max(1, input.pressureMultiplier ?? 1);
	return Math.min(idleBase * multiplier, changeSignalPressureCeilingMs(input.tierMs));
}

export function changeSignalDelayMs(input: {
	tierMs: number;
	level: ChangeSignalDecayLevel;
	pressureMultiplier?: number;
	/**
	 * Milliseconds remaining on a server-issued `Retry-After`, from now. A hard
	 * floor: the next tick never fires before it, whatever the tier says.
	 */
	retryAfterForMs?: number;
	random: () => number;
}): number {
	const steady = changeSignalSteadyIntervalMs(input);
	const jittered = Math.round(steady * (0.8 + 0.4 * input.random()));
	const retryAfterForMs = input.retryAfterForMs ?? 0;
	if (retryAfterForMs <= 0) return jittered;
	// Never earlier than the server asked, and never on the same millisecond as
	// every other register that got the same Retry-After — the spread is added ON
	// TOP so the floor still holds exactly.
	return Math.max(jittered, retryAfterForMs + Math.round(retryAfterForMs * 0.25 * input.random()));
}
