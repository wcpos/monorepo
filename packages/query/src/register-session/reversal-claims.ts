/**
 * Reversal ids `voidMovement` is creating right now: the target already carries the claim
 * (`voided_by`), the reversal row is not written yet. A claim naming an id in this set is
 * mid-flight and stands; a claim naming a missing id that is NOT here is an orphan (the
 * insert failed, or the process died between the two writes) and yields to the server.
 */
export const reversalsInFlight = new Set<string>();
