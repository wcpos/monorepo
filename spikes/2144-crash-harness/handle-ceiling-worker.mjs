import { errorInfo } from './workload.mjs';
self.onmessage = async ({ data }) => {
  const handles = [];
  let directory, result;
  try {
    directory = await (await navigator.storage.getDirectory()).getDirectoryHandle(data.directory, { create: true });
    for (let i = 0; i < 2048; i++) {
      const file = await directory.getFileHandle(`h${i}`, { create: true });
      handles.push(await file.createSyncAccessHandle());
    }
    result = { outcome: 'ok', count: handles.length, ceiling: 'no ceiling below 2,048' };
  } catch (e) { result = { outcome: handles.length ? 'ok' : 'open-failed', count: handles.length, exception: errorInfo(e) }; }
  finally { for (const h of handles) h.close(); }
  self.postMessage(result);
};
