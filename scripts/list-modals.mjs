import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const html = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../pages/admin.html'), 'utf8');
const ids = [...html.matchAll(/id="([^"]*[Mm]odal[^"]*)"/g)].map(m => m[1]);
console.log([...new Set(ids)].sort().join('\n'));
