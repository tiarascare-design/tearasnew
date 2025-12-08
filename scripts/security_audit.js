#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BUNDLE = path.join(ROOT, 'tearasnew-from-bundle');

const patterns = [
  {name: 'inline-event-handlers', re: /on\w+\s*=\s*\"|on\w+\s*=\s*\'/gi, desc: 'inline event handler attributes (onclick, onsubmit, etc)'} ,
  {name: 'document-write', re: /document\.write\s*\(/gi, desc: 'document.write usage'} ,
  {name: 'eval', re: /\beval\s*\(/gi, desc: 'eval usage'} ,
  {name: 'service-account-json', re: /firebase-adminsdk-.*\.json$/i, desc: 'firebase service account JSON filenames'} ,
];

function walk(dir, cb) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, cb);
    else cb(p);
  }
}

const findings = [];

if (!fs.existsSync(BUNDLE)) {
  console.error('Bundle folder not found:', BUNDLE);
  process.exit(2);
}

walk(BUNDLE, (file) => {
  const ext = path.extname(file).toLowerCase();
  if (!['.js', '.html', '.htm', '.json'].includes(ext)) return;
  let s = '';
  try { s = fs.readFileSync(file, 'utf8'); } catch (e) { return; }
  patterns.forEach(p => {
    let m;
    let idx = 0;
    while ((m = p.re.exec(s)) !== null) {
      const pos = m.index;
      const snippet = s.substring(pos, Math.min(pos + 120, s.length)).replace(/\n/g, ' ');
      findings.push({pattern: p.name, file: path.relative(ROOT, file), index: pos, snippet, desc: p.desc});
      // safety: avoid infinite loops for zero-length matches
      idx++; if (idx > 1000) break;
    }
  });
});

// Also check at repo root for any service account files
try {
  const rootFiles = fs.readdirSync(ROOT);
  rootFiles.forEach(f => {
    if (/firebase-adminsdk-.*\.json$/i.test(f)) {
      findings.push({pattern: 'service-account-json', file: f, index: 0, snippet: f, desc: 'service account JSON at repo root'});
    }
  });
} catch (e) {}

if (findings.length === 0) {
  console.log('Security audit: no findings');
  process.exit(0);
}

console.log('Security audit findings:\n');
findings.forEach((f, i) => {
  console.log(`${i+1}. ${f.desc}\n   file: ${f.file}\n   snippet: ${f.snippet}\n`);
});

console.log(`\nSummary: ${findings.length} finding(s).\n`);
// Exit with non-zero so CI can fail and force attention to issues
process.exit(3);
