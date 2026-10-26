import 'dotenv/config';
import { DatabaseSync, backup } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export async function backupDatabase(source, destination) {
  const input = path.resolve(source);
  const output = path.resolve(destination);
  if (input === output || fs.existsSync(output)) throw new Error('Đường dẫn backup phải là file mới, khác database nguồn.');
  fs.mkdirSync(path.dirname(output), {recursive:true});
  const db = new DatabaseSync(input, {readOnly:true});
  try { await backup(db, output); } finally { db.close(); }
  const copy = new DatabaseSync(output, {readOnly:true});
  try {
    const result = copy.prepare('PRAGMA integrity_check').get();
    if (Object.values(result)[0] !== 'ok') throw new Error('Backup không vượt qua integrity_check.');
  } finally { copy.close(); }
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const dir = path.resolve(process.env.DATA_DIR || 'db');
  const destination = process.argv[2] || path.join('backups',`app-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}.db`);
  console.log(await backupDatabase(path.join(dir,'app.db'),destination));
}
