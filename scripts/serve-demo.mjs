import os from 'node:os';
import path from 'node:path';

// Deliberate opt-in: never use the live database or production account credentials.
if(process.env.DEMO_MODE!=='true')throw new Error('Demo server requires DEMO_MODE=true. Use npm start for production.');
const demoDir=path.resolve(process.env.DEMO_DATA_DIR||path.join(os.tmpdir(),'driver-training-web-demo'));
if(demoDir===path.resolve('db'))throw new Error('Demo DATA_DIR must be separate from the production database.');
process.env.DATA_DIR=demoDir;
process.env.NODE_ENV='test';
process.env.ENABLE_DEMO_DATA='true';
process.env.HOST=process.env.HOST||'0.0.0.0';
delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
delete process.env.APP_STOP_TOKEN;
console.log('Starting isolated demo with sample accounts and sample certificates.');
await import('../dist/server.cjs');
