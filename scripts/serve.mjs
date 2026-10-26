import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const root = path.resolve(import.meta.dirname,'..');
process.chdir(root);
const pidFile = path.join(root,'storage','server-process.json');
fs.mkdirSync(path.dirname(pidFile),{recursive:true});
// Never stop another application merely because it occupies the expected port.
if (fs.existsSync(pidFile)) {
  const saved = JSON.parse(fs.readFileSync(pidFile,'utf8'));
  let running = false;
  try {process.kill(saved.launcherPid,0);running=true;} catch {}
  if (running) throw new Error('Ứng dụng đang chạy. Dùng stop.bat hoặc Ctrl+C ở cửa sổ server.');
}
const instance = crypto.randomBytes(32).toString('hex');
const child = spawn(process.execPath,[path.join(root,'dist','server.cjs')],{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,NODE_ENV:'production',APP_STOP_TOKEN:instance}});
fs.writeFileSync(pidFile,JSON.stringify({launcherPid:process.pid,childPid:child.pid,instance,root}));
child.on('exit',code=>{
  try {if(JSON.parse(fs.readFileSync(pidFile,'utf8')).instance === instance) fs.unlinkSync(pidFile);} catch {}
  process.exit(code ?? 0);
});
process.on('SIGINT',()=>child.kill('SIGINT'));
process.on('SIGTERM',()=>child.kill('SIGTERM'));
