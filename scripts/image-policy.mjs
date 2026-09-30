import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function checkImage(report, exceptions, now = new Date()) {
  if (!report.Metadata?.OS || !Array.isArray(report.Results) || !report.Results.some(result => result.Class === 'os-pkgs')) throw new Error('Missing OS scan results');
  const failures = [];
  const accepted = [];
  for (const result of report.Results) {
    for (const vulnerability of result.Vulnerabilities || []) {
      if (!['HIGH', 'CRITICAL'].includes(vulnerability.Severity)) continue;
      const exception = exceptions.find(item =>
        item.id === vulnerability.VulnerabilityID && item.type === result.Type && item.severity === vulnerability.Severity &&
        item.packages.includes(vulnerability.PkgName) && item.versions.includes(vulnerability.InstalledVersion) &&
        item.reason && item.owner && new Date(item.expires) > now &&
        !vulnerability.FixedVersion);
      (exception ? accepted : failures).push(`${vulnerability.VulnerabilityID} ${vulnerability.PkgName}@${vulnerability.InstalledVersion}`);
    }
  }
  return { failures, accepted };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = JSON.parse(readFileSync(process.argv[2]));
  const exceptions = JSON.parse(readFileSync(new URL('../security/image-exceptions.json', import.meta.url)));
  const result = checkImage(report, exceptions);
  console.log(JSON.stringify(result, null, 2));
  if (result.failures.length) process.exitCode = 1;
}
