const url = process.argv[2];
for (let attempt = 0; attempt < 60; attempt++) {
  try { if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) process.exit(0); } catch {}
  await new Promise(resolve => setTimeout(resolve, 1000));
}
throw new Error(`Not ready: ${url}`);
