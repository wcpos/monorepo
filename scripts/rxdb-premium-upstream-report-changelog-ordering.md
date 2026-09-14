# Upstream report for rxdb-premium: multi-instance changelog ops need identity and ordering

Prepared 2026-09-12 for submission to the rxdb-premium maintainers under the WCPOS
licence. Everything below was reproduced against `rxdb-premium@17.4.0` /
`rxdb@17.4.0` with the filesystem-node storage and two storage instances on one
directory (`multiInstance: true`); the OPFS storage shares the code path
(`plugins/storage-abstract-filesystem`).

> **Two parts of this are already filed upstream. Do not re-submit them.**
>
> The vendor asks for defects as a failing test in its own harness
> (`pubkey/rxdb-premium-issues`, see that repo's README), so the two reproducible
> parts went in that form on 2026-09-12:
>
> - **pubkey/rxdb-premium-issues#31** — the positional-apply defect below.
>   Reproduced with **two real processes, ordinary writes and clean exits**: no
>   fabricated BroadcastChannel message, no interruption, no override of vendor
>   logic. A stored document stays reachable by `findOne()` but vanishes from
>   `find({selector: {id: {$lt: 'c'}}})`. Cite this rather than the third-channel
>   reproduction sketched under "Reproduction" below — the vendor can dismiss an
>   injected message as something the storage never produced, and it cannot
>   dismiss this.
> - **pubkey/rxdb-premium-issues#30** — a *separate* window in the same
>   subsystem, not described in this document: an interrupted `cleanup()` between
>   the `persistInMemoryRows()` loop and `changelog.empty()` leaves the log
>   holding operations the index files already contain, and the next open applies
>   them twice. A follow-up comment there shows the window is wider still — an
>   interruption *inside* the loop leaves the index files at different
>   generations.
>
> Both were verified failing on 17.2.0 and 17.4.0, each with a passing control
> that moves the timing by one step.
>
> **Still unfiled, and both belong on the submit list:**
>
> - the contract changes this document asks for (carry identity/ordering on every
>   operation, or re-read the index files on lock acquisition);
> - the missed-broadcast cleanup defect under *"A second gap the same contract
>   would close"* below — instance B persisting its stale rows over the shared
>   index files. #30 is a different cleanup window (an interruption between the
>   persist loop and `changelog.empty()`, with no missed broadcast involved) and
>   #31 is the positional-apply defect, so neither covers it.

## Summary

`storage-abstract-filesystem` keeps every index as a sorted in-memory row array
`[indexString, byteStart, byteEnd]` and keeps peer instances coherent by
broadcasting changelog operations `[indexId, position, "A" | "D" | "R", row]` over
a `BroadcastChannel` named by the task-queue lock id. The receiver
(`storage-instance.js`, `broadcastChannelMessages$` subscriber) applies each
operation **by position only**, outside the task lock, through
`IndexState.runChangelogOperation`:

```js
if ("A" === op) rows.splice(position, 0, row)
else if ("D" === op) rows.splice(position, 1)
else rows[position] = row
```

Because the receiver never checks that the row at `position` is the row the
operation names, any operation that arrives late, twice, or after a local
mutation that moved rows is applied to the wrong row. A duplicate `D` deletes a
healthy neighbouring document's index row. We reproduced this with two
instances and a replayed delete: index lengths went from `[1, 2, 2]` to
`[1, 0, 0]` while the deleted documents were still readable by id.

## Reproduction

1. Two `getRxStorageFilesystemNode({ basePath })` instances on one directory,
   same database and collection, `multiInstance: true` (Node's global
   `BroadcastChannel` carries the events).
2. Write documents `001`, `002`, `003` through instance A; wait for B's
   `broadcastChannelMessages$` to deliver the bulk.
3. Post on a third `BroadcastChannel(state.broadcastChannel.name)` the message
   `{ type: "event", eventBulks: [], changelogOperations: [[0, 0, "D", rowOf002]] }`
   twice (a duplicate delete, as produced when two instances both drop the same
   hollow row during a leadership handoff).
4. B's primary index now lacks `001` as well as `002`: the second delete removed
   whatever sat at position 0.

The same shape arises without any duplicate whenever a receiver's rows are
stale relative to the sender's (for example after a receiver rebuilt its
indexes from `documents.json`, which emits no changelog operations).

## What we ship as a workaround

A postinstall patch (`scripts/patch-rxdb-premium-changelog-identity.mjs` in the
wcpos/monorepo repository) rewrites `runChangelogOperation` in both dists:

- `D`: match by index string (unique per document; the write path's delete
  carries the old string with the new byte range, so bytes cannot be part of a
  delete's identity); nothing matched → no-op.
- `A`: exact duplicate → no-op; stale position → sorted insert point; a row for
  the same document already present → replaced, never duplicated.
- `R`: match by index string; unknown document → inserted sorted.
- Secondary indexes are linked to their siblings at state creation and reject
  any `A`/`R` whose byte range differs from the primary index's current row for
  that document (every index row of a document carries the same range, and
  emitters push index 0 first).

The position-correct fast path returns exactly upstream's result.

## A second gap the same contract would close: cleanup persists stale rows after a missed broadcast

Reproduced on the installed storage with two instances: instance A compacts
(`cleanupDocumentJsonFile`), moving documents to lower offsets and broadcasting
`R` operations. With those broadcasts withheld from instance B — a tab that was
frozen, or one that was just promoted to leader and had not yet consumed the
channel — B's next cleanup runs `cleanupChangelogOperations`, which persists
B's live (stale) rows over the shared index files and empties the changelog.
The persisted indexes then address the wrong bytes. No wrapper-side change
fixes this: it is premium's own cleanup, and the only safe point to reconcile is
inside the collection lock before persisting. A reload of the persisted indexes
plus a replay of the durable changelog at lock acquisition (the resync we ask
for below) would close it, as would refusing to persist rows whose generation is
older than the on-disk one.

## Rollout note

The shipped receiver-side workaround changes nothing on the wire: it reads
the index string already present in `op[3]`, so a patched receiver can
identity-check a delete from any sender, patched or not. Two mixed-version
gaps remain during a rollout window:

- an unpatched receiver still applies every sender's delete by position — the
  original defect, and the more dangerous direction;
- once senders carry exact-row identity (a pending change tags the removed
  row on the write and cleanup paths), a receiver can only require it for
  senders that emit it; an older sender's delete still matches by index
  string alone, which is the same-string re-add limit described above.

Both argue for the identity being part of the contract rather than optional.

## What only the op contract can fix

If two senders' batches for the same document reach a third instance out of
order, the primary index's `R` rewinds that document's range to the older
bytes, and a range check against the primary then admits the stale secondary
row. The receiver has no ordering signal to reject it:

- byte-range monotonicity would reject it, but compaction legitimately moves
  documents to lower offsets, so that rule breaks compaction propagation;
- a same-document scan on every secondary insert is O(n) on the boot replay.

Two changes at the contract level would close this:

1. Carry the document's revision (or `_meta.lwt`, or a per-sender sequence) in
   every changelog operation, and have the receiver reject an operation older
   than the row it targets.
2. Or re-read the index files when an instance takes the task lock after a
   peer has written (a generation stamp per collection makes this one small
   read), so positions are never applied against stale rows.

We would also welcome identity-checked application upstream so the patch can
be retired: every operation already carries the row it means.
