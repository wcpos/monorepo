# Upstream report for rxdb-premium: multi-instance changelog ops need identity and ordering

Prepared 2026-09-12 for submission to the rxdb-premium maintainers under the WCPOS
licence. Everything below was reproduced against `rxdb-premium@17.4.0` /
`rxdb@17.4.0` with the filesystem-node storage and two storage instances on one
directory (`multiInstance: true`); the OPFS storage shares the code path
(`plugins/storage-abstract-filesystem`).

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
