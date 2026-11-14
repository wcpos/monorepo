// How immediate is Worker.terminate()? The page watches shared memory after calling it.
self.onmessage = ({ data }) => {
  const counter = new Int32Array(data.buffer);
  if (data.kind === 'spinning') for (;;) Atomics.add(counter, 0, 1);
  Atomics.store(counter, 0, 1);
  for (;;) Atomics.wait(counter, 1, 0); // blocked, like the boundary hold
};
