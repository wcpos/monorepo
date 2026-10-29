# Gallery baselines

Refreshed on 2026-10-28 after four component PRs merged on `next` without their cells (#3021 the tone vocabulary, #3022 the keypad key face, #3024 the tone map, #3025 the device row): every shard was red on `next` itself from `ea311c58d8`. The `gallery:update-baselines` label commits the PNGs; this file records why.

Refreshed on 2026-10-29 after #3043 (the library and apps/main read Text's type ladder) merged on `next` without its cells: shards 1 and 2 were red on `next` itself from `e9acb5886a` (`dropdown-menu--sheet--compact-coarse`, `form--field--compact-coarse` first; the shoot names one stale cell per run). Found from #3046, a core PR whose gallery shoot runs because it touches `packages/core/src/screens/`.
