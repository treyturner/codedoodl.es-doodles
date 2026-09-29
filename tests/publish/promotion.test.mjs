import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

test('promotion verifies source and both registry digests before changing either latest tag', t => {
  const script = resolve('scripts/promote-image.sh');
  const directory = mkdtempSync(join(tmpdir(), 'assets-promotion-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  git('init', '-b', 'master'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  git('commit', '--allow-empty', '-m', 'fixture');
  const commit = git('rev-parse', 'HEAD');
  git('update-ref', 'refs/remotes/origin/master', commit);
  mkdirSync(join(directory, 'bin'));
  const log = join(directory, 'calls');
  const digest = 'sha256:' + 'a'.repeat(64);
  writeFileSync(join(directory, 'bin/docker'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALL_LOG, JSON.stringify(args) + '\\n');
if (args[2] === 'inspect') {
  const mismatch = process.env.MISMATCH === '1' && args[3].startsWith('forgejo.');
  console.log(JSON.stringify({ digest: mismatch ? 'sha256:' + 'b'.repeat(64) : process.env.EXPECTED_DIGEST }));
} else if (args[2] !== 'create') process.exit(2);
`, { mode: 0o755 });
  const candidate = `candidate-${commit}-123-1`;
  const run = (args, overrides = {}) => {
    writeFileSync(log, '');
    const result = spawnSync('bash', [script, ...args], { cwd: directory, encoding: 'utf8',
      env: { ...process.env, PATH: join(directory, 'bin') + ':' + process.env.PATH,
        CALL_LOG: log, EXPECTED_DIGEST: digest, GITHUB_REF: 'refs/heads/master', ...overrides } });
    return { ...result, calls: readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) };
  };
  const args = ['test', candidate, digest];
  const dry = run(args);
  assert.equal(dry.status, 0, dry.stderr);
  assert.equal(dry.calls.length, 2);
  assert.ok(dry.calls.every(call => call[2] === 'inspect'));
  const apply = run([...args, '--apply']);
  assert.equal(apply.status, 0, apply.stderr);
  const writes = apply.calls.filter(call => call[2] === 'create');
  assert.equal(writes.length, 2);
  assert.ok(writes.every(call => call.at(-1).endsWith('/codedoodles-assets@' + digest)));
  const mismatch = run([...args, '--apply'], { MISMATCH: '1' });
  assert.notEqual(mismatch.status, 0);
  assert.ok(mismatch.calls.every(call => call[2] === 'inspect'));
  for (const [input, env] of [
    [[...args, '--apply'], { GITHUB_REF: 'refs/heads/feature' }],
    [['test', 'candidate-' + 'f'.repeat(40) + '-123-1', digest, '--apply'], {}],
    [['test', candidate, 'bad digest', '--apply'], {}],
    [['test', candidate, digest, '--unknown'], {}],
  ]) {
    const rejected = run(input, env);
    assert.notEqual(rejected.status, 0);
    assert.equal(rejected.calls.length, 0);
  }
});
