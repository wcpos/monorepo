// AppStack owns the session lifetime; the cached engine reads this on each automatic tick.
let pullsPaused = false;

export function setPullsPaused(paused: boolean): void {
	pullsPaused = paused;
}

export function getPullsPaused(): boolean {
	return pullsPaused;
}
