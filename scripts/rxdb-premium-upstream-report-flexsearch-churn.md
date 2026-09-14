# Upstream report for rxdb-premium: the FlexSearch index is re-fed on every write

Prepared 2026-09-12 for the rxdb-premium maintainers under the WCPOS licence, and as
material for pubkey/rxdb#9023, which reports the same family of symptom from a different
angle. Reproduced against `rxdb-premium@17.4.0` with `flexsearch@0.7.43`.

## Summary

`plugins/flexsearch/rx-fulltext-search.js` re-indexes a document on every change to the
source document, whether or not the text it indexes actually changed. Both call sites, the
boot replay and the `eventBulks$` subscriber, call `index.add(id, searchable)` unconditionally.

For a catalogue application this is mostly harmless. For a point of sale it is not. Every
sale writes its products to adjust stock, and stock is not a searchable field, so the
overwhelming majority of writes re-index text that is byte-identical to what the index
already holds.

Measured on the installed plugin, one document, text changed 10,000 times: the serialized
token map grew from 1.9 KB to 535 KB. With the same text each time it should not have grown
at all.

Two things make the cost compound rather than merely repeat:

- A tokenizer of `full` expands every token to all of its substrings, so each redundant
  re-index is proportional to the square of the term length, not its length.
- The persisted `append` history grows by one entry per processed update, and is compacted
  only from `postCleanup`. An instance whose RxDB cleanup is failing never compacts it, and
  then replays the whole history through `index.add` on every boot. That is the mechanism
  #9023 describes; the reporter reached it through document count, we reach it through
  update count, at a catalogue two orders of magnitude smaller.

## What we ship as a workaround

A postinstall patch, `scripts/patch-rxdb-premium-flexsearch-churn.mjs`, keeps a per-index
`Map` from document id to that document's exact searchable text, and skips `index.add`
entirely when the text is unchanged. When it did change, it prefers `index.update`, then
`remove`+`add`, then plain `add`, so the patch can never leave the plugin unusable. The map
is cleared when the instance closes, and is bounded by document count rather than update
count, which is the property that matters.

We tried a 32-bit digest first and withdrew it: `AaAa` and `BBBB` hash identically, and a
collision means the document keeps answering to its old text with nothing to surface the
fault. Storing the text is the only collision-free comparison, and for short indexed fields
it costs little.

The same comparison runs before the pipeline writes its `append` document, so a batch in
which nothing changed persists nothing at all. A batch carrying the same document more than
once is coalesced to its last entry first, or the history would record text the document no
longer has.

Measured after the patch: re-indexing a 50-term vocabulary twenty further times leaves the
serialized index byte-identical at 4,075 bytes.

## What only upstream can fix

Our patch stops new redundant history from being written, but it cannot touch what is
already on disk, and it cannot change when compaction runs. Two changes would close the
rest:

1. Give compaction a trigger that does not depend on `postCleanup`. An instance whose
   cleanup is failing today accumulates history forever with nothing to reclaim it, and the
   failure is in a different subsystem entirely.
2. Page the append history at rehydration rather than materializing all of it. #9023
   proposes this half, and it is what makes a boot survivable when the history is already
   large.

We would also welcome this comparison upstream so the patch can be retired. It is a handful
of lines and it is the difference between an index that is proportional to the catalogue and
one that is proportional to trading volume.
