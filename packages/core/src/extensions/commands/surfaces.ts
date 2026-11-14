import type { SurfaceTarget } from './types';

type Handler = () => void | Promise<void>;

export class SurfaceNotMountedError extends Error {
	constructor(readonly target: SurfaceTarget) {
		super(`Nothing is mounted for the "${target}" surface`);
		this.name = 'SurfaceNotMountedError';
	}
}

/**
 * Handlers registered by mounted surfaces, newest last (the #62 line registry's shape). A detach
 * removes only its own entry, so a remount keeps the new one and an older mount takes over.
 */
const surfaces = new Map<SurfaceTarget, { run: Handler }[]>();

/** Register a surface's handler; returns the detach (an effect's cleanup). */
export function registerSurface(target: SurfaceTarget, handler: Handler): () => void {
	const entry = { run: handler };
	surfaces.set(target, [...(surfaces.get(target) ?? []), entry]);
	return () => {
		surfaces.set(
			target,
			(surfaces.get(target) ?? []).filter((other) => other !== entry)
		);
	};
}

/** Run the newest handler for a target; rejects with `SurfaceNotMountedError` when none is mounted. */
export async function invokeSurface(target: SurfaceTarget): Promise<void> {
	const entry = surfaces.get(target)?.at(-1);
	if (!entry) throw new SurfaceNotMountedError(target);
	await entry.run();
}

/** Whether any handler is mounted for a target. */
export function hasSurface(target: SurfaceTarget): boolean {
	return (surfaces.get(target)?.length ?? 0) > 0;
}

/** Test-only: drop every registration. */
export function resetSurfaces(): void {
	surfaces.clear();
}
