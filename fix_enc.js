const fs = require('fs');
const path = require('path');

function walk(d) {
  fs.readdirSync(d).forEach(f => {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) {
      if (f !== 'node_modules') walk(p);
    } else if (p.endsWith('.html')) {
      let c = fs.readFileSync(p, 'utf8');
      if (c.includes('<script src=')) {
        c = c.replace(/<script src=/g, '<script charset="UTF-8" src=');
        fs.writeFileSync(p, c);
        console.log('Fixed', p);
      }
    }
  });
}
walk('.');
console.log('Done!');
