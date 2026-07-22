import { getPrimaryKeyFromIndexableString } from "rxdb/plugins/core";

function isMalformedJson(error) {
  return error?.name === "SyntaxError";
}

function parseStorageResult(result) {
  if (typeof result === "string") {
    JSON.parse(result);
  }
  return result;
}

function extractDocument(text, primaryPath, expectedId) {
  for (
    let start = text.indexOf("{");
    start >= 0;
    start = text.indexOf("{", start + 1)
  ) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let cursor = start; cursor < text.length; cursor += 1) {
      const character = text[cursor];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}" && --depth === 0) {
        try {
          const document = JSON.parse(text.slice(start, cursor + 1));
          if (document?.[primaryPath] === expectedId) return document;
        } catch {}
        break;
      }
    }
  }
}

async function repairDocument(instance, documentId) {
  const state = await instance.internals.statePromise;
  return instance.taskQueue.runCleanup(async (runState) => {
    const primaryRow = state.firstIdx.metaIdMap.get(documentId);
    if (!primaryRow) return "missing-primary-row";

    const oldStart = primaryRow[1];
    const oldEnd = primaryRow[2];
    const indexRows = state.indexStates.map((indexState) => {
      const position = indexState.rows.findIndex(
        (row) => row[1] === oldStart && row[2] === oldEnd,
      );
      return { indexState, position };
    });
    if (indexRows.some(({ position }) => position < 0))
      return "missing-index-row";

    let accessHandlePromise = runState.accessHandlers.get(
      state.documentFileHandle,
    );
    if (!accessHandlePromise) {
      accessHandlePromise = state.documentFileHandle.createAccessHandle();
      runState.accessHandlers.set(
        state.documentFileHandle,
        accessHandlePromise,
      );
    }
    const accessHandle = await accessHandlePromise;
    const damagedBytes = await accessHandle.read(oldStart, oldEnd);
    const document = extractDocument(
      instance._decode(damagedBytes),
      instance.primaryPath,
      documentId,
    );
    if (!document) return "no-valid-document";
    try {
      if (
        indexRows.some(
          ({ indexState, position }) =>
            indexState.getIndexableString(document) !==
            indexState.rows[position][0],
        )
      )
        return "index-mismatch";
    } catch {
      return "index-mismatch";
    }

    const recoveredBytes = instance._encode(JSON.stringify(document));
    const repairedBytes = new Uint8Array(oldEnd - oldStart);
    if (recoveredBytes.byteLength > repairedBytes.byteLength)
      return "recovered-document-too-large";
    repairedBytes.fill(32);
    repairedBytes.set(recoveredBytes);

    const writable = await accessHandle.getWritable();
    await writable.write(repairedBytes, { at: oldStart });
    await writable.flush?.();
    return true;
  });
}

async function reconcileSecondaryIndexes(instance) {
  const state = await instance.internals.statePromise;
  return instance.taskQueue.runCleanup(async (runState) => {
    let accessHandlePromise = runState.accessHandlers.get(
      state.documentFileHandle,
    );
    if (!accessHandlePromise) {
      accessHandlePromise = state.documentFileHandle.createAccessHandle();
      runState.accessHandlers.set(
        state.documentFileHandle,
        accessHandlePromise,
      );
    }
    const accessHandle = await accessHandlePromise;
    const secondaries = state.indexStates.filter(
      (indexState) => indexState !== state.firstIdx,
    );
    // The primary index is the rebuild source, so it must be corroborated,
    // not merely self-consistent: every index must hold one row per document,
    // and for each document a majority of the secondary indexes must
    // reference the primary's exact byte range. A stale-but-parseable primary
    // (or a truncated one) loses that vote and reconciliation refuses rather
    // than persisting rebuilt indexes against the wrong bytes.
    if (
      secondaries.some(
        (indexState) => indexState.rows.length !== state.firstIdx.rows.length,
      )
    ) {
      return "cardinality-mismatch";
    }
    const keyLength = state.firstIdx.primaryKeyLength;
    const secondaryRanges = secondaries.map((indexState) => {
      const ranges = new Map();
      for (const [indexKey, start, end] of indexState.rows) {
        ranges.set(getPrimaryKeyFromIndexableString(indexKey, keyLength), [
          start,
          end,
        ]);
      }
      return ranges;
    });
    const documents = [];
    const seenRanges = new Set();
    for (const [indexKey, start, end] of state.firstIdx.rows) {
      const documentId = getPrimaryKeyFromIndexableString(indexKey, keyLength);
      const corroborating = secondaryRanges.filter((ranges) => {
        const range = ranges.get(documentId);
        return range && range[0] === start && range[1] === end;
      }).length;
      if (corroborating * 2 <= secondaries.length)
        return `uncorroborated-primary-range:${documentId.trim()}`;
      const document = JSON.parse(
        instance._decode(await accessHandle.read(start, end)),
      );
      if (state.firstIdx.getIndexableString(document) !== indexKey)
        return `primary-row-mismatch:${documentId.trim()}`;
      if (seenRanges.has(start))
        return `duplicate-primary-range:${documentId.trim()}`;
      seenRanges.add(start);
      documents.push({ document, start, end });
    }

    let repaired = false;
    for (const indexState of state.indexStates) {
      if (indexState === state.firstIdx) continue;
      const rebuilt = documents
        .map(({ document, start, end }) => [
          indexState.getIndexableString(document),
          start,
          end,
        ])
        .sort((left, right) => (left[0] < right[0] ? -1 : 1));
      if (JSON.stringify(rebuilt) !== JSON.stringify(indexState.rows)) {
        indexState.rows = rebuilt;
        repaired = true;
      }
    }
    if (!repaired) return "no-divergence";

    // Emptying the changelog drops pending row operations for every index, so
    // every index must be persisted from its current in-memory rows — the same
    // pairing the storage's own cleanupChangelogOperations maintains.
    for (const indexState of state.indexStates) {
      await indexState.persistInMemoryRows(runState);
    }
    await state.changelog.empty(runState);
    return true;
  });
}

export function withTargetedOpfsRecovery(storage) {
  const createStorageInstance = storage.createStorageInstance.bind(storage);
  return {
    ...storage,
    async createStorageInstance(params) {
      const instance = await createStorageInstance(params);
      const findDocumentsById = instance.findDocumentsById.bind(instance);
      const bulkWrite = instance.bulkWrite.bind(instance);
      const query = instance.query.bind(instance);
      const getChangedDocumentsSince =
        instance.getChangedDocumentsSince.bind(instance);

      const repairMalformedIds = async (ids, onMalformedBatch) => {
        const repairBatch = async (batch) => {
          try {
            parseStorageResult(await findDocumentsById(batch, true));
            return false;
          } catch (error) {
            if (!isMalformedJson(error)) throw error;
            onMalformedBatch?.();
            if (batch.length === 1) {
              const failure = await repairDocument(instance, batch[0]);
              if (typeof failure === "string") {
                error.message += `; targeted recovery failed for ${batch[0]}: ${failure}`;
                throw error;
              }
              return true;
            }
            const middle = Math.ceil(batch.length / 2);
            const repairedLeft = await repairBatch(batch.slice(0, middle));
            const repairedRight = await repairBatch(batch.slice(middle));
            return repairedLeft || repairedRight;
          }
        };
        return repairBatch([...new Set(ids)]);
      };

      instance.findDocumentsById = async (ids, withDeleted) => {
        try {
          return parseStorageResult(await findDocumentsById(ids, withDeleted));
        } catch (error) {
          if (!isMalformedJson(error)) throw error;
          if (await repairMalformedIds(ids))
            return findDocumentsById(ids, withDeleted);
          if (ids.length > 1) {
            const batches = await Promise.all(
              ids.map((id) => findDocumentsById([id], withDeleted)),
            );
            const documents = batches.flatMap((batch) =>
              typeof batch === "string" ? JSON.parse(batch) : batch,
            );
            return typeof batches[0] === "string"
              ? JSON.stringify(documents)
              : documents;
          }
          throw error;
        }
      };

      instance.bulkWrite = async (documentWrites, context) => {
        const ids = documentWrites.map(
          (row) => row.document[instance.primaryPath],
        );
        let malformedBatch = false;
        await repairMalformedIds(ids, () => {
          malformedBatch = true;
        });
        if (malformedBatch && documentWrites.length > 1) {
          const results = await Promise.all(
            documentWrites.map((row) => bulkWrite([row], context)),
          );
          await instance.taskQueue?.awaitIdle?.();
          return {
            error: results.flatMap((result) => result.error),
          };
        }
        return bulkWrite(documentWrites, context);
      };

      // When every per-document probe parses but an index-driven read is
      // malformed, the documents are healthy and a secondary index's byte
      // ranges are stale — rebuild the secondary indexes from the primary.
      // Concurrent reads hit a stale index together (startup runs queries in
      // parallel), so reconciliation is shared: one rebuild runs at a time,
      // and a read whose failure predates someone else's successful rebuild
      // retries instead of rethrowing its stale error.
      let reconcileGeneration = 0;
      let pendingReconcile;
      const reconcileOnce = () => {
        if (!pendingReconcile) {
          pendingReconcile = reconcileSecondaryIndexes(instance)
            .then((repaired) => {
              if (repaired === true) reconcileGeneration += 1;
              return repaired;
            })
            .finally(() => {
              pendingReconcile = undefined;
            });
        }
        return pendingReconcile;
      };

      const repairIndexedRead = async (error, generationAtStart) => {
        const state = await instance.internals.statePromise;
        if (await repairMalformedIds(state.firstIdx.metaIdMap.keys()))
          return true;
        // A rebuild changes row offsets without emitting changelog operations,
        // so a multi-instance peer's stale in-memory rows could later persist
        // over it — only reconcile when this instance is the sole owner.
        let refusal = "multi-instance";
        if (!params.multiInstance) {
          try {
            const outcome = await reconcileOnce();
            if (outcome === true) return true;
            refusal = outcome;
          } catch (reconcileError) {
            refusal = `error ${reconcileError?.message ?? reconcileError}`;
          }
        }
        if (reconcileGeneration !== generationAtStart) return true;
        error.message += `; index reconciliation refused: ${refusal}`;
        return false;
      };

      instance.query = async (preparedQuery) => {
        const generationAtStart = reconcileGeneration;
        try {
          return parseStorageResult(await query(preparedQuery));
        } catch (error) {
          if (
            !isMalformedJson(error) ||
            !(await repairIndexedRead(error, generationAtStart))
          ) {
            throw error;
          }
          return query(preparedQuery);
        }
      };

      instance.getChangedDocumentsSince = async (limit, checkpoint) => {
        const generationAtStart = reconcileGeneration;
        try {
          return parseStorageResult(
            await getChangedDocumentsSince(limit, checkpoint),
          );
        } catch (error) {
          if (
            !isMalformedJson(error) ||
            !(await repairIndexedRead(error, generationAtStart))
          ) {
            throw error;
          }
          return getChangedDocumentsSince(limit, checkpoint);
        }
      };

      return instance;
    },
  };
}
