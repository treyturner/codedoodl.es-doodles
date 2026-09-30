import { readFileSync } from 'node:fs';
import { createHash, X509Certificate } from 'node:crypto';

// Trust only this run's isolated TLS fixture key. Blanket certificate-error
// bypass leaves SSL errors attached to responses and prevents Chrome caching.
const certificate = new X509Certificate(readFileSync('/certs/cert.pem'));
const spki = createHash('sha256').update(certificate.publicKey.export({ type: 'spki', format: 'der' })).digest('base64');
export const tlsArgs = [`--ignore-certificate-errors-spki-list=${spki}`];
