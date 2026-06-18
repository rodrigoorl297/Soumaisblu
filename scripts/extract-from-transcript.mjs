import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..');
const transcriptDirs = [
  path.join(process.env.USERPROFILE || '', '.cursor/projects/c-Users-bluno-Downloads-leadsmanager-atualizado-public-ht/agent-transcripts'),
];

function walkJsonl(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkJsonl(p, acc);
    else if (ent.name.endsWith('.jsonl')) acc.push(p);
  }
  return acc;
}

function unescapeJson(s) {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function extractWrites(files, targetName) {
  let best = null;
  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf8');
    for (const line of raw.split('\n')) {
      if (!line.includes(targetName)) continue;
      if (!line.includes('"Write"') && !line.includes('Write')) continue;
      const idx = line.indexOf('"contents":"');
      if (idx < 0) continue;
      let i = idx + '"contents":"'.length;
      let out = '';
      while (i < line.length) {
        const ch = line[i];
        if (ch === '\\' && i + 1 < line.length) {
          out += ch + line[i + 1];
          i += 2;
          continue;
        }
        if (ch === '"' && line.slice(i).match(/^"(?:,"path"|,\s*"path"|\}\})/)) break;
        out += ch;
        i++;
      }
      const content = unescapeJson(out);
      if (targetName.endsWith('.js') && !/^(\/\*|const |let |var |\(function|window\.)/.test(content.trim())) continue;
      if (targetName.endsWith('.php') && !/^<\?php/.test(content.trim())) continue;
      if (!best || content.length > best.length) best = content;
    }
  }
  return best;
}

const files = transcriptDirs.flatMap(d => walkJsonl(d));
const targets = {
  'js/painel-sonhos.js': 'painel-sonhos.js',
  'js/rh-ops.js': 'rh-ops.js',
  'js/partners-ui.js': 'partners-ui.js',
  'js/rh-feedback.js': 'rh-feedback.js',
  'js/cbo.js': 'cbo.js',
  'js/rh-relatorios.js': 'rh-relatorios.js',
  'js/prestador-servicos.js': 'prestador-servicos.js',
  'js/esteira-credito.js': 'esteira-credito.js',
  'api/migrate-rh-core.php': 'migrate-rh-core.php',
  'api/migrate-rh-justificativa.php': 'migrate-rh-justificativa.php',
  'api/migrate-rh-cbo.php': 'migrate-rh-cbo.php',
  'api/migrate-proposals-comissao.php': 'migrate-proposals-comissao.php',
};

for (const [rel, name] of Object.entries(targets)) {
  const content = extractWrites(files, name);
  if (!content || content.length < 80) {
    console.log('MISSING', rel);
    continue;
  }
  const dest = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content, 'utf8');
  console.log('OK', rel, content.split('\n').length, 'lines');
}
