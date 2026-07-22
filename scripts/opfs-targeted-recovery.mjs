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
    if (indexRows.some(({ position }) => position < 0)) return "missing-index-row";

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
    if (recoveredBytes.byteLength > repairedBytes.byteLength) return "recovered-document-too-large";
    repairedBytes.fill(32);
    repairedBytes.set(recoveredBytes);

    const writable = await accessHandle.getWritable();
    await writable.write(repairedBytes, { at: oldStart });
    await writable.flush?.();
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

      const repairMalformedIds = async (ids) => {
        const repairBatch = async (batch) => {
          try {
            parseStorageResult(await findDocumentsById(batch, true));
            return false;
          } catch (error) {
            if (!isMalformedJson(error)) throw error;
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
          if (!isMalformedJson(error) || !(await repairMalformedIds(ids)))
            throw error;
          return findDocumentsById(ids, withDeleted);
        }
      };

      instance.bulkWrite = async (documentWrites, context) => {
        const ids = documentWrites.map(
          (row) => row.document[instance.primaryPath],
        );
        await repairMalformedIds(ids);
        return bulkWrite(documentWrites, context);
      };

      instance.query = async (preparedQuery) => {
        try {
          return parseStorageResult(await query(preparedQuery));
        } catch (error) {
          const state = await instance.internals.statePromise;
          if (
            !isMalformedJson(error) ||
            !(await repairMalformedIds(state.firstIdx.metaIdMap.keys()))
          ) {
            throw error;
          }
          return query(preparedQuery);
        }
      };

      instance.getChangedDocumentsSince = async (limit, checkpoint) => {
        try {
          return parseStorageResult(
            await getChangedDocumentsSince(limit, checkpoint),
          );
        } catch (error) {
          const state = await instance.internals.statePromise;
          if (
            !isMalformedJson(error) ||
            !(await repairMalformedIds(state.firstIdx.metaIdMap.keys()))
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
