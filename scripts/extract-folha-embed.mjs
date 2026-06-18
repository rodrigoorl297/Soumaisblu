import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'pages', 'folha-pagamento.html');
const lines = fs.readFileSync(htmlPath, 'utf8').split(/\r?\n/);
const chunk = lines.slice(646, 834).join('\n');
const wrap = `<div id="rhFolhaEmbedRoot" class="rh-folha-inline" hidden>\n${chunk}\n</div>\n`;
fs.writeFileSync(path.join(root, 'pages', 'folha-embed.html'), wrap);
console.log('wrote folha-embed.html', wrap.length, 'bytes');
