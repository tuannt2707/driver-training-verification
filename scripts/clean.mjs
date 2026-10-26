import fs from 'node:fs';
import path from 'node:path';
// Fixed build paths only; application data is never removed.
const root = path.resolve(import.meta.dirname, '..');
for (const name of ['dist', 'server.js']) {
  const target = path.resolve(root, name);
  if (path.dirname(target) !== root) throw new Error('Invalid build path');
  fs.rmSync(target, {recursive:true,force:true});
}
