// Streams a URL to disk with progress and cancellation. Writes to <file>.part and renames when complete.
const fs = require('fs');

async function downloadFile(url, dest, { onProgress = () => {}, signal } = {}) {
  if (fs.existsSync(dest)) { onProgress(1); return 'exists'; }
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  let got = 0;
  const tmp = `${dest}.part`;
  try {
    // Sequential read -> copy -> write with backpressure. Chunks are copied because the fetch body may reuse
    // its buffers while an earlier write is still pending, which produced scrambled (corrupt) video files.
    const out = fs.createWriteStream(tmp);
    const failed = new Promise((_, rej) => out.once('error', rej));
    const write = (buf) => new Promise((res, rej) => out.write(buf, (e) => (e ? rej(e) : res())));
    await Promise.race([failed, (async () => {
      for await (const chunk of res.body) {
        if (signal && signal.aborted) throw new Error('aborted');
        const buf = Buffer.from(chunk);
        got += buf.length;
        await write(buf);
        if (total) onProgress(Math.min(got / total, 1));
      }
      await new Promise((r) => out.end(r));
    })()]);
    if (total && got !== total) throw new Error(`Incomplete download: ${got} of ${total} bytes`);
    fs.renameSync(tmp, dest);
    onProgress(1);
    return 'saved';
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}

module.exports = { downloadFile };
