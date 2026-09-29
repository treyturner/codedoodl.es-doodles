import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkImage } from '../../scripts/image-policy.mjs';
test('image policy fails missing scans, high/critical findings, fixes and expired exceptions', () => {
  assert.throws(() => checkImage({}, []), /Missing OS/);
  const vulnerability = { VulnerabilityID: 'CVE-test', PkgName: 'example', InstalledVersion: '1', Severity: 'HIGH' };
  const report = { Metadata: { OS: { Family: 'alpine' } }, Results: [{ Class: 'os-pkgs', Type: 'alpine', Vulnerabilities: [vulnerability] }] };
  assert.equal(checkImage(report, []).failures.length, 1);
  const exception = { id: 'CVE-test', type: 'alpine', packages: ['example'], versions: ['1'], severity: 'HIGH',
    reason: 'Reviewed test fixture', owner: 'Test', expires: '2030-01-01' };
  assert.equal(checkImage(report, [exception], new Date('2026-01-01')).accepted.length, 1);
  assert.equal(checkImage(report, [{ ...exception, expires: '2020-01-01' }]).failures.length, 1);
  vulnerability.FixedVersion = '2';
  assert.equal(checkImage(report, [exception]).failures.length, 1);
  vulnerability.Severity = 'CRITICAL';
  assert.equal(checkImage(report, []).failures.length, 1);
  vulnerability.Severity = 'LOW';
  assert.equal(checkImage(report, []).failures.length, 0);
});
