/**
 * Scheduler owner ids that say which JS runtime minted them (#3500).
 *
 * A launch that is killed or crashes mid-walk cannot release its persisted scheduler claims:
 * its `in-flight` rows keep a live lease for up to 30 s. While every require plane stamped the
 * constant owner `'require-plane'`, a relaunch could not tell those rows from a live owner's,
 * so it skipped them as active and waited for the `scheduler-drain` maintenance tick to reclaim
 * them after expiry.
 *
 * Every minted id now carries this runtime's boot id. A row whose owner carries a DIFFERENT boot
 * id was claimed by a runtime that is gone (or, at worst, by a second live runtime over the same
 * database, which costs one duplicate read-only fetch; the loser's CAS fails as `claim-lost`).
 * Owners within one runtime share the boot id, so they never treat each other as dead.
 */

const MAX_OWNER_ID_LENGTH = 128; // `ownerId` maxLength in scheduler-task-state-schema.ts
const BOOT_ID_PATTERN = /@boot:([^@]+)$/;

let bootId: string | null = null;

// Owner ids only need to be unique, not unguessable, and the read path must not depend on Web Crypto (secure-context-only on web).
function mintIdPart(mintUuid: () => string): string {
	try {
		return mintUuid();
	} catch {
		return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
	}
}

function runtimeBootId(mintUuid: () => string): string {
	return (bootId ??= mintIdPart(mintUuid));
}

export function mintSchedulerOwnerId(role: string, mintUuid: () => string): string {
	const ownerId = `${role}:${mintIdPart(mintUuid)}@boot:${runtimeBootId(mintUuid)}`;
	if (ownerId.length > MAX_OWNER_ID_LENGTH) {
		throw new Error(
			`mintSchedulerOwnerId: owner id for role "${role}" exceeds ${MAX_OWNER_ID_LENGTH} characters`
		);
	}
	return ownerId;
}

export function isOwnerFromAnotherBoot(ownerId: string | null): boolean {
	if (ownerId === null) return false;
	const match = BOOT_ID_PATTERN.exec(ownerId);
	if (match === null) return false;
	// A minted id seen before this runtime minted any was minted by a different runtime.
	return match[1] !== bootId;
}

/** Test-only: forget this runtime's boot id, so a test can simulate a fresh process. */
export function __resetSchedulerBootIdForTests(): void {
	bootId = null;
}
