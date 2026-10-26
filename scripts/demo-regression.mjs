import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {DatabaseSync} from 'node:sqlite';

const root=process.cwd();
const sandbox=fs.mkdtempSync(path.join(os.tmpdir(),'driver-demo-check-'));
const protectedDir=path.join(sandbox,'unused-production-dir');fs.mkdirSync(protectedDir);
const cleanEnv={...process.env};delete cleanEnv.DEMO_MODE;
const rejected=spawn(process.execPath,['scripts/serve-demo.mjs'],{cwd:root,windowsHide:true,env:cleanEnv,stdio:'ignore'});
assert.notEqual(await new Promise(resolve=>rejected.once('exit',resolve)),0,'Demo must require explicit opt-in');
const port=await new Promise(resolve=>{const socket=net.createServer();socket.listen(0,'127.0.0.1',()=>{const port=socket.address().port;socket.close(()=>resolve(port));});});
const demoDir=path.join(sandbox,'demo');
let output='';
const server=spawn(process.execPath,['scripts/serve-demo.mjs'],{cwd:root,windowsHide:true,env:{...process.env,DEMO_MODE:'true',DEMO_DATA_DIR:demoDir,DATA_DIR:protectedDir,NODE_ENV:'production',ENABLE_DEMO_DATA:'false',HOST:'127.0.0.1',PORT:String(port)},stdio:['ignore','pipe','pipe']});
server.stdout.on('data',chunk=>output+=chunk);server.stderr.on('data',chunk=>output+=chunk);
try{
  const base='http://127.0.0.1:'+port;
  let ready=false;
  for(let attempt=0;attempt<100;attempt++){
    if(server.exitCode!==null)throw new Error(output);
    try{const response=await fetch(base+'/api/public/security-config');if(response.ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.ok(ready,'Demo server must start');
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'Admin@2026!'})});
  assert.equal(login.status,200,'Sample admin login must work in isolated demo');
  const auth=await login.json();
  const stats=await fetch(base+'/api/admin/stats',{headers:{Authorization:'Bearer '+auth.token}});
  assert.equal(stats.status,200);assert.ok((await stats.json()).data.totalDrivers>0,'Demo certificates should be available');
  assert.ok(!fs.existsSync(path.join(protectedDir,'app.db')),'Inherited production DATA_DIR must never be opened');
  const demoDb=new DatabaseSync(path.join(demoDir,'app.db'),{readOnly:true});
  assert.equal(demoDb.prepare('SELECT COUNT(*) AS n FROM users').get().n,3);demoDb.close();
  console.log('Demo opt-in, isolated storage, sample login and certificate checks passed.');
}finally{
  if(server.exitCode===null)await new Promise(resolve=>{server.once('exit',resolve);server.kill();});
}
