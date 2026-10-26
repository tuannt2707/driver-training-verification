import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import XLSX from 'xlsx';
import { backupDatabase } from './backup.mjs';
import { effectiveStatus, todayVN, defaultCertificateExpiry, normalizeCertificateDates, CERTIFICATE_DATE_FIELDS } from '../server/rules.ts';

const root = process.cwd();
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'driver-regression-'));
const password = crypto.randomBytes(24).toString('base64url');
const stopToken = crypto.randomBytes(32).toString('hex');
let child, base, output = '';
let checks = 0;
const check = (label, fn) => { fn(); checks++; console.log(`PASS ${label}`); };
async function request(url, method = 'GET', body, token, extra = {}) {
  const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }, ...(body === undefined ? {} : {body:JSON.stringify(body)}) });
  const text = await response.text();
  let data; try {data = JSON.parse(text);} catch {data = {text};}
  return {status:response.status, data, headers:response.headers};
}
async function start(bootstrap = true) {
  const port = await new Promise(resolve => {const socket = net.createServer(); socket.listen(0,'127.0.0.1',()=>{const port=socket.address().port;socket.close(()=>resolve(port));});});
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [path.join(root,'dist','server.cjs')], {cwd:root,windowsHide:true,env:{...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:String(port),DATA_DIR:sandbox,ENABLE_DEMO_DATA:'false',TRUSTED_PROXIES:'',APP_STOP_TOKEN:stopToken,BOOTSTRAP_ADMIN_PASSWORD:bootstrap ? password : ''},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',c=>output+=c); child.stderr.on('data',c=>output+=c);
  let ready = false;
  for (let i=0;i<100;i++) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${output}`);
    try { const r=await request('/api/public/security-config'); if(r.status===200){ready=true;break;} } catch {}
    await new Promise(r=>setTimeout(r,50));
  }
  assert.ok(ready, 'Server must become ready');
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  await new Promise(resolve => {child.once('exit',resolve);child.kill();});
}
const login = async (username, pw = password) => {
  const r = await request('/api/auth/login','POST',{username,password:pw});
  assert.equal(r.status,200, `Login ${username}: ${JSON.stringify(r.data)}`);
  return r.data.token;
};
const fixture = (schoolCode='AUDIT-A', extra={}) => ({fullName:'NGUYỄN VĂN KIỂM THỬ',dateOfBirth:'1990-01-15',cccdNumber:'079123456789',licenseNumber:'790123456789',licenseClass:'Hạng B2',schoolCode,schoolName:'Ignored client school name',courseCode:'AUDIT-01',courseName:'Tập huấn',transportUnit:'Đơn vị lịch sử',examScore:'8/10',examEligibility:'Đủ điều kiện',issueDate:'2026-01-01',validUntil:'2029-01-01',address:{province:'TP. Hồ Chí Minh',streetAddress:'PRIVATE-STREET'},...extra});
try {
  await start();
  let admin = await login('admin');
  const emptyStats = await request('/api/admin/stats','GET',undefined,admin);
  check('Dashboard handles an empty database with six zero-filled months',()=>{
    assert.equal(emptyStats.data.data.totalDrivers,0);
    assert.equal(emptyStats.data.data.createdByMonth.length,6);
    assert.ok(emptyStats.data.data.createdByMonth.every(item=>item.count===0));
    assert.equal(emptyStats.data.data.expiringSoonCount,0);
  });
  const anonymousStats = await request('/api/admin/stats');
  check('Dashboard statistics require authentication',()=>assert.equal(anonymousStats.status,401));
  check('Session tokens use 256 bits from the cryptographic RNG',()=>assert.match(admin,/^[a-f0-9]{64}$/));
  const demoLogin = await request('/api/auth/login','POST',{username:'admin',password:'Admin@2026!'});
  check('No demo credentials in production',()=>assert.equal(demoLogin.status,401));
  const createSchool = async code => {
    const r=await request('/api/schools','POST',{name:'Trường '+code,code,address:'TP. Hồ Chí Minh',classes:['B2'],sampleToken:'private-school-sample-token'},admin);
    assert.equal(r.status,200,JSON.stringify(r.data));
  };
  await createSchool('AUDIT-A'); await createSchool('AUDIT-B');
  const schools = await request('/api/public/schools');
  check('Public school directory does not expose sample QR tokens',()=>assert.ok(!JSON.stringify(schools.data).includes('private-school-sample-token')));
  const schoolChange = await request('/api/schools/'+schools.data.data[0].id,'PUT',{code:'RENAMED'},admin);
  check('School codes cannot be changed to orphan existing records',()=>assert.equal(schoolChange.status,400));
  const lastAdmin = await request('/api/admin/users/'+(await request('/api/auth/me','GET',undefined,admin)).data.user.id,'PUT',{status:'DISABLED'},admin);
  check('Last active superadmin cannot be disabled',()=>assert.equal(lastAdmin.status,400));
  const a = await request('/api/admin/certificates','POST',fixture(),admin);
  const b = await request('/api/admin/certificates','POST',fixture('AUDIT-B'),admin);
  check('Create certificates with normalized school and score',()=>{assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(a.data.data.schoolName,'Trường AUDIT-A');});
  const anonymous = await request('/api/admin/certificates?limit=-1');
  check('Anonymous certificate enumeration denied',()=>assert.equal(anonymous.status,401));
  for(const limit of ['-1','0','201','NaN']) {
    const r=await request('/api/admin/certificates?limit='+limit,'GET',undefined,admin);
    check(`Invalid pagination ${limit} rejected`,()=>assert.equal(r.status,400));
  }
  const direct = await request('/api/public/verify-certificate/'+a.data.data.qrToken);
  check('QR access preserves full identity',()=>{assert.equal(direct.status,200);assert.equal(direct.data.data.cccd,fixture().cccdNumber);});
  for (const payload of [{cccd:fixture().cccdNumber},{lookupType:'other',cccd:fixture().cccdNumber},{lookupType:'cccd',cccd:fixture().cccdNumber,fullName:'NGUYỄN'}]) {
    const r=await request('/api/public/lookup','POST',payload);
    check('Incomplete or unknown lookup rejected',()=>assert.equal(r.status,400));
  }
  const query = {lookupType:'cccd',cccd:fixture().cccdNumber,fullName:'nguyen van kiem thu',dateOfBirth:'15/01/1990'};
  const lookup = await request('/api/public/lookup','POST',query);
  check('Public JSON is masked and carries no QR capability or full address',()=>{
    assert.equal(lookup.status,200);assert.equal(lookup.data.count,2);
    const data=JSON.stringify(lookup.data);
    assert.ok(!data.includes(fixture().cccdNumber));assert.ok(!data.includes(fixture().licenseNumber));assert.ok(!data.includes('PRIVATE-STREET'));
    assert.ok(lookup.data.data.every(c=>!c.qrToken));
  });
  const partial = await request('/api/public/lookup','POST',{...query,fullName:'nguyen'});
  check('Partial names do not match full-name verification',()=>assert.equal(partial.data.count,0));
  const badUser=await request('/api/admin/users','POST',{username:'unbound',password,fullName:'Unbound',role:'SCHOOL_ADMIN'},admin);
  check('Unbound school admins rejected',()=>assert.equal(badUser.status,400));
  const invalidRole=await request('/api/admin/users','POST',{username:'invalid',password,fullName:'Invalid',role:'GOD'},admin);
  check('Unknown roles rejected',()=>assert.equal(invalidRole.status,400));
  const user=await request('/api/admin/users','POST',{username:'school.audit',password,fullName:'School audit',role:'SCHOOL_ADMIN',schoolCode:'AUDIT-A'},admin);
  assert.equal(user.status,200,JSON.stringify(user.data));
  let school=await login('school.audit');
  const cross=await request('/api/admin/certificates/'+b.data.data.id,'GET',undefined,school);
  check('School cannot read another school detail',()=>assert.equal(cross.status,403));
  const foreignUpdate=await request('/api/admin/certificates/'+b.data.data.id,'PUT',{notes:'forbidden'},school);
  check('School cannot update another school',()=>assert.equal(foreignUpdate.status,403));
  const list=await request('/api/admin/certificates?schoolCode=AUDIT-B','GET',undefined,school);
  check('List scope cannot be overridden by school query',()=>assert.ok(list.data.items.every(c=>c.schoolCode==='AUDIT-A')));
  const stats=await request('/api/admin/stats','GET',undefined,school);
  check('Dashboard respects school scope',()=>assert.equal(stats.data.data.totalDrivers,1));
  check('Dashboard monthly counts and recent rows respect school scope',()=>{
    assert.equal(stats.data.data.createdByMonth.reduce((sum,item)=>sum+item.count,0),1);
    assert.ok(stats.data.data.recentCertificates.every(item=>item.schoolCode==='AUDIT-A'));
    assert.ok(!JSON.stringify(stats.data).includes(b.data.data.certificateNumber));
  });
  check('Dashboard recent rows contain no raw identity or QR capability',()=>{
    const json=JSON.stringify(stats.data);
    assert.ok(!json.includes(fixture().cccdNumber));
    assert.ok(!json.includes(a.data.data.qrToken));
  });
  await createSchool('ALL');
  await request('/api/admin/users','POST',{username:'school.all',password,fullName:'School literal ALL',role:'SCHOOL_ADMIN',schoolCode:'ALL'},admin);
  const literalSchool = await login('school.all');
  const literalStats = await request('/api/admin/stats','GET',undefined,literalSchool);
  check('Dashboard treats a literal school code ALL as a strict school scope',()=>{
    assert.equal(literalStats.data.data.totalDrivers,0);
    assert.deepEqual(literalStats.data.data.recentCertificates,[]);
    assert.ok(literalStats.data.data.createdByMonth.every(item=>item.count===0));
  });
  const audit=await request('/api/admin/audit-logs','GET',undefined,school);
  check('School cannot read system audit log',()=>assert.equal(audit.status,403));
  for(const [kind,fields] of [
    ['training-programs',{description:'Nội dung tập huấn',durationHours:'16'}],
    ['transport-units',{taxCode:'0123456789',businessLicense:'GP-01',address:'Địa chỉ đơn vị',phone:'02812345678',email:'contact@example.test',contactPerson:'Đầu mối đơn vị'}],
  ]) {
    const path='/api/admin/'+kind;
    const anonymousCatalog=await request(path);
    const forbiddenCatalog=await request(path,'POST',{code:'CAT-01',name:'Danh mục thử',...fields},school);
    check(kind+' requires authentication and restricts writes to superadmin',()=>{assert.equal(anonymousCatalog.status,401);assert.equal(forbiddenCatalog.status,403);});
    const createdCatalog=await request(path,'POST',{code:'CAT-01',name:kind==='training-programs'?fixture().courseName:fixture().transportUnit,...fields},admin);
    check(kind+' creates validated business catalog data',()=>{assert.equal(createdCatalog.status,201);assert.equal(createdCatalog.data.data.isActive,true);for(const [field,value] of Object.entries(fields))assert.equal(createdCatalog.data.data[field],value);});
    const duplicateCatalog=await request(path,'POST',{code:'cat-01',name:'Trùng mã',...fields},admin);
    check(kind+' prevents duplicate codes regardless of case',()=>assert.equal(duplicateCatalog.status,409));
    const readCatalog=await request(path+'?search=CAT-01&status=ACTIVE','GET',undefined,school);
    check(kind+' allows school staff to search shared active entries',()=>{assert.equal(readCatalog.status,200);assert.equal(readCatalog.data.total,1);assert.equal(readCatalog.data.data[0].id,createdCatalog.data.data.id);});
    const forbiddenEdit=await request(path+'/'+createdCatalog.data.data.id,'PUT',{name:'Không được sửa'},school);
    check(kind+' school staff cannot modify catalog entries',()=>assert.equal(forbiddenEdit.status,403));
    const invalidCatalog=await request(path,'POST',{code:'BAD-01',name:'Thử dữ liệu sai',...fields,...(kind==='training-programs'?{durationHours:'0'}:{taxCode:'abc'})},admin);
    check(kind+' rejects invalid catalog-specific fields',()=>assert.equal(invalidCatalog.status,400));
    const changedCatalog=await request(path+'/'+createdCatalog.data.data.id,'PUT',{name:'Đã đổi tên',isActive:false},admin);
    const activeCatalog=await request(path+'?status=ACTIVE','GET',undefined,admin);
    const disabledCatalog=await request(path+'?status=DISABLED','GET',undefined,school);
    check(kind+' soft deactivation preserves record and hides it from active suggestions',()=>{assert.equal(changedCatalog.status,200);assert.equal(activeCatalog.data.total,0);assert.equal(disabledCatalog.data.total,1);assert.equal(disabledCatalog.data.data[0].name,'Đã đổi tên');});
    const badPagination=await request(path+'?limit=-1','GET',undefined,admin);
    const missingCatalog=await request(path+'/missing','PUT',{name:'Không tồn tại'},admin);
    check(kind+' validates pagination and missing IDs',()=>{assert.equal(badPagination.status,400);assert.equal(missingCatalog.status,404);});
  }
  const preservedCertificate=await request('/api/admin/certificates/'+a.data.data.id,'GET',undefined,admin);
  check('Catalog edits preserve historical certificate training and transport text',()=>{assert.equal(preservedCertificate.data.data.courseName,fixture().courseName);assert.equal(preservedCertificate.data.data.transportUnit,fixture().transportUnit);assert.equal(preservedCertificate.data.data.certificateNumber,a.data.data.certificateNumber);});
  const linkedProgram=await request('/api/admin/training-programs','POST',{code:'LINK-CT',name:'Chương trình liên kết'},admin);
  const linkedUnit=await request('/api/admin/transport-units','POST',{code:'LINK-DV',name:'Đơn vị liên kết'},admin);
  const linkFields={trainingProgramId:linkedProgram.data.data.id,transportUnitId:linkedUnit.data.data.id};
  const linkedCertificate=await request('/api/admin/certificates','POST',fixture('AUDIT-A',{...linkFields,courseName:'Tên giả',transportUnit:'Đơn vị giả'}),admin);
  check('Certificate stores catalog IDs and resolves names on the server',()=>{assert.equal(linkedCertificate.status,200);assert.equal(linkedCertificate.data.data.courseName,'Chương trình liên kết');assert.equal(linkedCertificate.data.data.transportUnit,'Đơn vị liên kết');assert.equal(linkedCertificate.data.data.trainingProgramId,linkFields.trainingProgramId);assert.equal(linkedCertificate.data.data.transportUnitId,linkFields.transportUnitId);});
  const forgedLink=await request('/api/admin/certificates','POST',fixture('AUDIT-A',{trainingProgramId:'missing'}),admin);
  check('Certificate rejects a nonexistent catalog link',()=>assert.equal(forgedLink.status,400));
  await request('/api/admin/training-programs/'+linkFields.trainingProgramId,'PUT',{name:'Chương trình đổi tên',isActive:false},admin);
  await request('/api/admin/transport-units/'+linkFields.transportUnitId,'PUT',{name:'Đơn vị đổi tên',isActive:false},admin);
  const keepLinks=await request('/api/admin/certificates/'+linkedCertificate.data.data.id,'PUT',{notes:'Sửa thông tin khác',courseName:'Ghi đè giả',transportUnit:'Giả'},admin);
  check('Editing other certificate fields preserves links and historical names after catalog deactivation',()=>{assert.equal(keepLinks.status,200,JSON.stringify(keepLinks.data));assert.equal(keepLinks.data.data.courseName,'Chương trình liên kết');assert.equal(keepLinks.data.data.transportUnit,'Đơn vị liên kết');assert.equal(keepLinks.data.data.transportUnitId,linkFields.transportUnitId);});
  const inactiveLink=await request('/api/admin/certificates','POST',fixture('AUDIT-A',linkFields),admin);
  check('Inactive catalog entries cannot be linked to a new certificate',()=>assert.equal(inactiveLink.status,400));
  const replacementProgram=await request('/api/admin/training-programs','POST',{code:'LINK-CT2',name:'Chương trình thay thế'},admin);
  const changeLink=await request('/api/admin/certificates/'+linkedCertificate.data.data.id,'PUT',{trainingProgramId:replacementProgram.data.data.id,transportUnitId:'',transportUnit:''},admin);
  check('Certificate can change a program link and clear an optional transport unit',()=>{assert.equal(changeLink.status,200);assert.equal(changeLink.data.data.courseName,'Chương trình thay thế');assert.equal(changeLink.data.data.trainingProgramId,replacementProgram.data.data.id);assert.equal(changeLink.data.data.transportUnit,'');assert.equal(changeLink.data.data.transportUnitId,'');});
  await request('/api/admin/certificates/'+linkedCertificate.data.data.id,'DELETE',undefined,admin);
  const keyInput={name:'Regression integration',organization:'Test organization',expiresAt:new Date(Date.now()+86400000).toISOString(),rateLimit:120};
  const verify=(key,body={cccd:fixture().cccdNumber})=>request('/api/v1/certificates/verify','POST',body,undefined,key?{'X-API-Key':key}:{});
  const anonymousKeys=await request('/api/admin/api-keys');
  const schoolKeys=await request('/api/admin/api-keys','POST',keyInput,school);
  check('API key management requires an authenticated superadmin',()=>{assert.equal(anonymousKeys.status,401);assert.equal(schoolKeys.status,403);});
  for(const extra of [{expiresAt:'2026-02-30T00:00:00Z'},{expiresAt:'2099-01-01T00:00:00Z'},{expiresAt:'2026-01-01T00:00:00'}, {schoolCode:'MISSING'},{rateLimit:0},{rateLimit:121},{rateLimit:1.5}]) {
    const invalid=await request('/api/admin/api-keys','POST',{...keyInput,...extra},admin);
    check('Invalid key configuration rejected '+JSON.stringify(extra),()=>assert.equal(invalid.status,400));
  }
  const issuedKey=await request('/api/admin/api-keys','POST',keyInput,admin);
  const scopedKey=await request('/api/admin/api-keys','POST',{...keyInput,schoolCode:'AUDIT-A'},admin);
  const allLiteralKey=await request('/api/admin/api-keys','POST',{...keyInput,schoolCode:'ALL'},admin);
  check('Key issuance returns a random 256-bit secret once',()=>{assert.equal(issuedKey.status,201);assert.match(issuedKey.data.apiKey,/^dtv_[a-f0-9]{64}$/);assert.notEqual(issuedKey.data.apiKey,scopedKey.data.apiKey);});
  const keyList=await request('/api/admin/api-keys','GET',undefined,admin);
  check('Management lists only safe key metadata',()=>{assert.equal(keyList.data.data.length,3);assert.ok(!JSON.stringify(keyList.data).includes(issuedKey.data.apiKey));assert.ok(!JSON.stringify(keyList.data).includes('keyHash'));assert.equal(keyList.data.data.find(k=>k.id===issuedKey.data.data.id).keyPrefix,issuedKey.data.apiKey.slice(0,12));});
  const noKey=await verify();
  const wrongKey=await verify('dtv_'+'0'.repeat(64));
  const sessionAsKey=await verify(admin);
  const queryKey=await request('/api/v1/certificates/verify?apiKey='+issuedKey.data.apiKey,'POST',{cccd:fixture().cccdNumber},admin);
  check('Verification rejects missing, wrong, session and query credentials',()=>{for(const response of [noKey,wrongKey,sessionAsKey,queryKey])assert.equal(response.status,401);});
  const verified=await verify(issuedKey.data.apiKey);
  check('Integration verifies certificates with a valid key and CCCD',()=>{assert.equal(verified.status,200);assert.equal(verified.data.count,2);assert.equal(verified.data.total,2);assert.equal(verified.data.hasValidCertificate,true);assert.ok(verified.data.data.every(c=>c.isValid));assert.equal(verified.headers.get('x-request-id'),verified.data.requestId);});
  check('Integration returns the same complete certificate DTO as QR verification',()=>{
    const integrated=verified.data.data.find(c=>c.certificateNumber===direct.data.data.certificateNumber);
    const {verifiedAt:apiTime,isValid,...apiCertificate}=integrated;
    const {verifiedAt:qrTime,...qrCertificate}=direct.data.data;
    assert.deepEqual(apiCertificate,qrCertificate);
    assert.equal(isValid,qrCertificate.isIssued);
    assert.equal(integrated.cccd,fixture().cccdNumber);
    assert.equal(integrated.licenseNumber,fixture().licenseNumber);
    assert.equal(integrated.qrToken,a.data.data.qrToken);
    assert.ok(integrated.addressMasked.includes('PRIVATE-STREET'));
    assert.ok(Number.isFinite(Date.parse(apiTime))&&Number.isFinite(Date.parse(qrTime)));
  });
  const scopedVerified=await verify(scopedKey.data.apiKey);
  const literalVerified=await verify(allLiteralKey.data.apiKey);
  check('API key school scopes are strict, including the literal code ALL',()=>{assert.equal(scopedVerified.data.count,1);assert.equal(scopedVerified.data.data[0].schoolCode,'AUDIT-A');assert.equal(literalVerified.data.count,0);});
  const emptyVerified=await verify(issuedKey.data.apiKey,{cccd:'000000000001'});
  check('No integration match is an explicit empty success',()=>{assert.equal(emptyVerified.status,200);assert.equal(emptyVerified.data.hasValidCertificate,false);assert.deepEqual(emptyVerified.data.data,[]);});
  const malformedVerified=await verify(issuedKey.data.apiKey,{cccd:79123456789});
  const bulkVerified=await verify(issuedKey.data.apiKey,{cccd:[fixture().cccdNumber]});
  check('Integration requires one CCCD string of exactly twelve digits',()=>{assert.equal(malformedVerified.status,400);assert.equal(bulkVerified.status,400);});
  const limitedKey=await request('/api/admin/api-keys','POST',{...keyInput,rateLimit:1},admin);
  const firstKeyUse=await verify(limitedKey.data.apiKey);
  const secondKeyUse=await verify(limitedKey.data.apiKey);
  check('Per-key quota returns 429 with retry and remaining headers',()=>{assert.equal(firstKeyUse.status,200);assert.equal(secondKeyUse.status,429);assert.equal(secondKeyUse.headers.get('x-ratelimit-remaining'),'0');assert.ok(Number(secondKeyUse.headers.get('retry-after'))>0);});
  const independentKeyUse=await verify(scopedKey.data.apiKey);
  check('A saturated key does not consume another key quota',()=>assert.equal(independentKeyUse.status,200));
  const keyUsage=await request('/api/admin/api-keys/'+issuedKey.data.data.id+'/usage','GET',undefined,admin);
  const forbiddenUsage=await request('/api/admin/api-keys/'+issuedKey.data.data.id+'/usage','GET',undefined,school);
  check('Usage is admin-only and records status without CCCD or raw key',()=>{assert.equal(forbiddenUsage.status,403);assert.ok(keyUsage.data.data.some(r=>r.httpStatus===400));assert.ok(keyUsage.data.data.some(r=>r.httpStatus===200));assert.ok(!JSON.stringify(keyUsage.data).includes(fixture().cccdNumber));assert.ok(!JSON.stringify(keyUsage.data).includes(issuedKey.data.apiKey));});
  const schoolRow=schools.data.data.find(s=>s.code==='AUDIT-A');
  await request('/api/schools/'+schoolRow.id,'PUT',{isActive:false},admin);
  const inactiveScope=await verify(scopedKey.data.apiKey);
  await request('/api/schools/'+schoolRow.id,'PUT',{isActive:true},admin);
  check('A disabled school immediately blocks its integration key',()=>assert.equal(inactiveScope.status,403));
  const forbiddenRevoke=await request('/api/admin/api-keys/'+scopedKey.data.data.id,'DELETE',undefined,school);
  const revokedKey=await request('/api/admin/api-keys/'+scopedKey.data.data.id,'DELETE',undefined,admin);
  const repeatRevoke=await request('/api/admin/api-keys/'+scopedKey.data.data.id,'DELETE',undefined,admin);
  const revokedUse=await verify(scopedKey.data.apiKey);
  check('Only superadmins revoke keys and revocation is immediate and idempotent',()=>{assert.equal(forbiddenRevoke.status,403);assert.equal(revokedKey.status,200);assert.equal(repeatRevoke.status,200);assert.equal(revokedUse.status,401);});
  const keyDb=new DatabaseSync(path.join(sandbox,'app.db'));
  const storedKey=keyDb.prepare('SELECT * FROM api_keys WHERE id=?').get(issuedKey.data.data.id);
  check('Database stores only the key digest and persistent counters',()=>{assert.equal(storedKey.keyHash,crypto.createHash('sha256').update(issuedKey.data.apiKey).digest('hex'));assert.ok(!JSON.stringify(storedKey).includes(issuedKey.data.apiKey));assert.equal(storedKey.requestCount,4);});
  keyDb.prepare('UPDATE api_keys SET expiresAt=? WHERE id=?').run('2020-01-01T00:00:00Z',allLiteralKey.data.data.id);
  keyDb.close();
  const expiredKeyUse=await verify(allLiteralKey.data.apiKey);
  check('Expired keys fail immediately',()=>assert.equal(expiredKeyUse.status,401));
  const licenseVerified=await verify(issuedKey.data.apiKey,{licenseNumber:fixture().licenseNumber});
  check('Integration finds certificates by exact license number with the complete QR DTO',()=>{
    assert.equal(licenseVerified.status,200);assert.equal(licenseVerified.data.total,2);assert.equal(licenseVerified.data.hasValidCertificate,true);
    assert.deepEqual(licenseVerified.data.data.map(c=>c.certificateNumber).sort(),verified.data.data.map(c=>c.certificateNumber).sort());
    assert.ok(licenseVerified.data.data.every(c=>c.licenseNumber===fixture().licenseNumber&&c.isTokenAccess&&c.qrToken));
  });
  const licenseScopedKey=await request('/api/admin/api-keys','POST',{...keyInput,schoolCode:'AUDIT-A'},admin);
  const licenseScoped=await verify(licenseScopedKey.data.apiKey,{licenseNumber:fixture().licenseNumber,schoolCode:'AUDIT-B'});
  check('License lookup cannot expand its API key school scope',()=>{assert.equal(licenseScoped.data.count,1);assert.equal(licenseScoped.data.data[0].schoolCode,'AUDIT-A');});
  const emptyLicense=await verify(issuedKey.data.apiKey,{licenseNumber:'000000000001'});
  check('Unmatched license returns an empty success without falling back to CCCD',()=>{assert.equal(emptyLicense.status,200);assert.deepEqual(emptyLicense.data.data,[]);assert.equal(emptyLicense.data.hasValidCertificate,false);});
  for(const body of [{},{licenseNumber:790123456789},{licenseNumber:'790123'},{licenseNumber:[fixture().licenseNumber]},{licenseNumber:fixture().licenseNumber,cccd:fixture().cccdNumber}]) {
    const invalidLicense=await verify(issuedKey.data.apiKey,body);
    check('License lookup rejects missing, malformed or ambiguous identity '+JSON.stringify(body),()=>assert.equal(invalidLicense.status,400));
  }
  const licenseUsage=await request('/api/admin/api-keys/'+issuedKey.data.data.id+'/usage','GET',undefined,admin);
  check('Integration usage does not retain license numbers',()=>assert.ok(!JSON.stringify(licenseUsage.data).includes(fixture().licenseNumber)));
  const owner=await request('/api/admin/users','POST',{username:'integration.owner',password,fullName:'Integration owner',role:'SUPERADMIN'},admin);
  const ownerToken=await login('integration.owner');
  const ownerKey=await request('/api/admin/api-keys','POST',keyInput,ownerToken);
  await request('/api/admin/users/'+owner.data.data.id,'PUT',{status:'DISABLED'},admin);
  const disabledOwnerUse=await verify(ownerKey.data.apiKey);
  check('Disabling the issuing superadmin also blocks its keys',()=>assert.equal(disabledOwnerUse.status,401));
  const disabled=await request('/api/admin/users/'+user.data.data.id,'PUT',{status:'DISABLED',role:'INSPECTOR'},admin);
  assert.equal(disabled.status,200,JSON.stringify(disabled.data));
  const stale=await request('/api/auth/me','GET',undefined,school);
  check('Disabling and demoting revokes existing session',()=>assert.equal(stale.status,401));
  await request('/api/admin/users/'+user.data.data.id,'PUT',{status:'ACTIVE',role:'SCHOOL_ADMIN',schoolCode:'AUDIT-A'},admin);
  school=await login('school.audit');
  await request('/api/admin/users/'+user.data.data.id,'PUT',{password:password+'new'},admin);
  const afterPasswordChange = await request('/api/auth/me','GET',undefined,school);
  check('Password changes revoke existing sessions',()=>assert.equal(afterPasswordChange.status,401));
  school=await login('school.audit',password+'new');
  assert.equal((await request('/api/auth/logout','POST',{},school)).status,200);
  const afterLogout=await request('/api/auth/me','GET',undefined,school);
  check('Server logout revokes token',()=>assert.equal(afterLogout.status,401));
  const qToken=await request('/api/auth/me?token='+admin);
  check('Bearer token in query strings not accepted',()=>assert.equal(qToken.status,401));
  const zero=await request('/api/admin/certificates/import-excel','POST',{schoolCode:'AUDIT-A',rows:[{'Họ và Tên':'AUDIT ZERO','Ngày Sinh':'1990-01-15','Số CCCD':'079123456780','Số GPLX':'790123456780','Hạng GPLX':'B2','Điểm Kiểm Tra':0}]},admin);
  assert.equal(zero.status,200,JSON.stringify(zero.data));assert.equal(zero.data.importedCount,1,JSON.stringify(zero.data));
  const zeroList=await request('/api/admin/certificates?search=AUDIT%20ZERO','GET',undefined,admin);
  check('Zero score and exported header capitalization are preserved',()=>{const c=zeroList.data.items[0];assert.equal(c.examScore,'0/10');assert.equal(c.examResult,'Không đạt');assert.equal(c.status,'PENDING');});
  const invalidIssue=await request('/api/admin/certificates/'+zeroList.data.items[0].id,'PUT',{status:'ISSUED'},admin);
  check('Cannot issue a certificate for failed examination',()=>assert.equal(invalidIssue.status,400));
  const missingScore=await request('/api/admin/certificates','POST',fixture('AUDIT-A',{examScore:''}),admin);
  check('Missing score never becomes maximum score',()=>{assert.equal(missingScore.status,200);assert.equal(missingScore.data.data.status,'PENDING');assert.equal(missingScore.data.data.examResult,'Không đạt');});
  const invalidDate=await request('/api/admin/certificates','POST',fixture('AUDIT-A',{dateOfBirth:'31/02/1990'}),admin);
  check('Manual creation validates date',()=>assert.equal(invalidDate.status,400));
  const batch = [
    {'Họ và tên':'ATOMIC BATCH','Ngày sinh':'1990-01-15','Số CCCD':'079123456780','Số GPLX':'790123456780','Mã Cơ Sở':'AUDIT-A','Điểm Kiểm Tra':'8/10'},
    {'Họ và tên':'INVALID SCHOOL','Ngày sinh':'1990-01-15','Số CCCD':'079123456780','Số GPLX':'790123456780','Mã Cơ Sở':'MISSING','Điểm Kiểm Tra':'8/10'}
  ];
  const atomic = await request('/api/admin/certificates/import-excel','POST',{rows:batch},admin);
  const atomicList = await request('/api/admin/certificates?search=ATOMIC%20BATCH','GET',undefined,admin);
  check('Import rolls back the whole batch unless skipping errors is explicit',()=>{assert.equal(atomic.data.importedCount,0);assert.equal(atomicList.data.total,0);});
  const partialImport = await request('/api/admin/certificates/import-excel','POST',{rows:batch,importValidOnly:true},admin);
  check('Explicit skip-errors import retains valid rows only',()=>assert.equal(partialImport.data.importedCount,1));
  const first=await request('/api/admin/certificates','POST',fixture(),admin);
  const last=await request('/api/admin/certificates','POST',fixture(),admin);
  await request('/api/admin/certificates/'+first.data.data.id,'DELETE',undefined,admin);
  const next=await request('/api/admin/certificates','POST',fixture(),admin);
  check('Deleted certificate numbers are not reused',()=>{assert.equal(next.status,200);assert.notEqual(next.data.data.certificateNumber,first.data.data.certificateNumber);assert.notEqual(next.data.data.certificateNumber,last.data.data.certificateNumber);});
  const expired=await request('/api/admin/certificates','POST',fixture('AUDIT-A',{validUntil:'2026-02-01'}),admin);
  assert.equal(expired.status,200);
  const expiredList=await request('/api/admin/certificates?status=EXPIRED','GET',undefined,admin);
  check('List filters use effective expiration',()=>assert.ok(expiredList.data.items.some(c=>c.id===expired.data.data.id)));
  const statusVerified=await verify(issuedKey.data.apiKey);
  check('Integration marks expired and pending certificates invalid',()=>{assert.ok(statusVerified.data.data.some(c=>c.status==='EXPIRED'&&!c.isValid));assert.ok(statusVerified.data.data.some(c=>c.status==='PENDING'&&!c.isValid));});
  const capDb=new DatabaseSync(path.join(sandbox,'app.db'));
  const capTemplate=capDb.prepare('SELECT * FROM certificates WHERE id=?').get(a.data.data.id);
  const capColumns=Object.keys(capTemplate);
  const capInsert=capDb.prepare('INSERT INTO certificates ('+capColumns.join(',')+') VALUES ('+capColumns.map(()=>'?').join(',')+')');
  for(let i=0;i<101;i++) {
    const record={...capTemplate,id:'integration-cap-'+i,certificateNumber:'INTEGRATION-CAP-'+i,qrToken:crypto.randomBytes(20).toString('hex'),cccdNumber:'000000000099',status:i===100?'ISSUED':'REVOKED',issueDate:i===100?'2025-01-01':'2026-01-01'};
    capInsert.run(...capColumns.map(column=>record[column]));
  }
  const capped=await verify(issuedKey.data.apiKey,{cccd:'000000000099'});
  check('Capped responses still evaluate validity across every matching certificate',()=>{assert.equal(capped.data.count,100);assert.equal(capped.data.total,101);assert.equal(capped.data.truncated,true);assert.ok(capped.data.data.every(c=>c.status==='REVOKED'&&!c.isValid));assert.equal(capped.data.hasValidCertificate,true);});
  capDb.prepare("DELETE FROM certificates WHERE id LIKE 'integration-cap-%'").run();capDb.close();
  const day = todayVN();
  const inDays = value=>{const date=new Date(day+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+value);return date.toISOString().slice(0,10);};
  for(const [code,days,status] of [['AUDIT-A',30,'ISSUED'],['AUDIT-B',1,'ISSUED'],['AUDIT-A',31,'ISSUED'],['AUDIT-A',1,'PENDING']]) {
    const record=await request('/api/admin/certificates','POST',fixture(code,{issueDate:day,validUntil:inDays(days),status}),admin);
    assert.equal(record.status,200,JSON.stringify(record.data));
  }
  const overview=await request('/api/admin/stats','GET',undefined,admin);
  check('Dashboard expiration window includes day 30 and excludes day 31 and pending records',()=>assert.equal(overview.data.data.expiringSoonCount,2));
  check('Dashboard monthly series is chronological and reconciles newly created records',()=>{
    const data=overview.data.data;
    assert.deepEqual(data.createdByMonth.map(item=>item.month),data.createdByMonth.map(item=>item.month).sort());
    assert.equal(new Set(data.createdByMonth.map(item=>item.month)).size,6);
    assert.equal(data.createdByMonth.at(-1).month,day.slice(0,7));
    assert.equal(data.createdByMonth.reduce((sum,item)=>sum+item.count,0),data.totalDrivers);
    assert.equal(data.issuedCount+data.pendingCount+data.expiredCount+data.revokedCount,data.totalDrivers);
    assert.ok(Number.isFinite(Date.parse(data.generatedAt)));
  });
  school=await login('school.audit',password+'new');
  const scopedOverview=await request('/api/admin/stats?schoolCode=AUDIT-B','GET',undefined,school);
  check('Dashboard expiring count cannot be expanded with a foreign school query',()=>assert.equal(scopedOverview.data.data.expiringSoonCount,1));
  const excelRes=await fetch(base+'/api/admin/certificates/export-excel',{headers:{Authorization:'Bearer '+admin}});
  assert.equal(excelRes.status,200);
  const book=XLSX.read(Buffer.from(await excelRes.arrayBuffer()),{type:'buffer'});
  const rows=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{raw:false,defval:''});
  const reimport=await request('/api/admin/certificates/import-excel','POST',{rows},admin);
  check('Exported workbook can be imported as new records',()=>{assert.equal(reimport.status,200);assert.equal(reimport.data.importedCount,rows.length,JSON.stringify(reimport.data));});
  check('Five-year calendar expiry handles leap days, invalid dates and the Vietnam date boundary',()=>{
    assert.equal(defaultCertificateExpiry('2026-10-23'),'2031-10-23');
    assert.equal(defaultCertificateExpiry('2024-02-29'),'2029-02-28');
    assert.equal(defaultCertificateExpiry('2026-12-31'),'2031-12-31');
    assert.equal(defaultCertificateExpiry('30/02/2026'),'');
    assert.equal(defaultCertificateExpiry(todayVN(new Date('2026-10-23T17:00:00Z'))),'2031-10-24');
  });
  const {validUntil:ignoredExpiry,...fiveYearFixture}=fixture();
  const fiveYear=await request('/api/admin/certificates','POST',{...fiveYearFixture,issueDate:'2024-02-29'},admin);
  check('API creation defaults to five years with leap-day clamping',()=>{assert.equal(fiveYear.status,200,JSON.stringify(fiveYear.data));assert.equal(fiveYear.data.data.validUntil,'2029-02-28');});
  const unchangedExpiry=await request('/api/admin/certificates/'+a.data.data.id,'PUT',{notes:'Preserve historical expiration'},admin);
  check('Editing unrelated historical data preserves its original expiration',()=>{assert.equal(unchangedExpiry.status,200);assert.equal(unchangedExpiry.data.data.validUntil,a.data.data.validUntil);});
  const movedIssue=await request('/api/admin/certificates/'+fiveYear.data.data.id,'PUT',{issueDate:'2025-03-01'},admin);
  check('Changing issue date without an explicit expiration recalculates five years',()=>{assert.equal(movedIssue.status,200);assert.equal(movedIssue.data.data.validUntil,'2030-03-01');});
  const explicitExpiry=await request('/api/admin/certificates/'+fiveYear.data.data.id,'PUT',{issueDate:'2025-04-01',validUntil:'2028-06-30'},admin);
  check('Explicit exception expiration takes priority during update',()=>{assert.equal(explicitExpiry.status,200);assert.equal(explicitExpiry.data.data.validUntil,'2028-06-30');});
  const invalidExpiry=await request('/api/admin/certificates/'+fiveYear.data.data.id,'PUT',{issueDate:'2030-01-01',validUntil:'2029-01-01'},admin);
  const invalidExpiryIssue=await request('/api/admin/certificates','POST',{...fiveYearFixture,issueDate:'2026-02-30'},admin);
  check('Invalid issue dates and expiration before issue date remain rejected',()=>{assert.equal(invalidExpiry.status,400);assert.equal(invalidExpiryIssue.status,400);});
  const expiryImport=await request('/api/admin/certificates/import-excel','POST',{schoolCode:'AUDIT-A',rows:[
    {'Họ và tên':'FIVE YEAR EXCEL','Ngày sinh':'1990-01-15','Số CCCD':'079123456780','Số GPLX':'790123456780','Điểm Kiểm Tra':'8/10','Ngày Cấp':'2024-02-29'},
    {'Họ và tên':'EXCEPTION EXCEL','Ngày sinh':'1990-01-15','Số CCCD':'079123456780','Số GPLX':'790123456780','Điểm Kiểm Tra':'8/10','Ngày Cấp':'2024-02-29','Có Giá Trị Đến':'2028-12-31'},
  ]},admin);
  const fiveYearExcel=await request('/api/admin/certificates?search=FIVE%20YEAR%20EXCEL','GET',undefined,admin);
  const exceptionExcel=await request('/api/admin/certificates?search=EXCEPTION%20EXCEL','GET',undefined,admin);
  check('Excel defaults to five years and preserves explicit expiration exceptions',()=>{assert.equal(expiryImport.data.importedCount,2,JSON.stringify(expiryImport.data));assert.equal(fiveYearExcel.data.items[0].validUntil,'2029-02-28');assert.equal(exceptionExcel.data.items[0].validUntil,'2028-12-31');});
  check('Calendar normalization preserves invalid legacy data for validation instead of dropping it',()=>{
    const original={dateOfBirth:'20/11/1998',issueDate:'2026-10-20',decisionDate:'31/02/2026',examDate:null,notes:'keep'};
    const normalized=normalizeCertificateDates(original);
    assert.equal(normalized.dateOfBirth,'1998-11-20');assert.equal(normalized.issueDate,'2026-10-20');assert.equal(normalized.decisionDate,'31/02/2026');assert.equal(normalized.examDate,'');assert.equal(original.dateOfBirth,'20/11/1998');assert.equal(normalized.notes,'keep');
  });
  const dateDb=new DatabaseSync(path.join(sandbox,'app.db'));
  const legacyDates=Object.fromEntries(CERTIFICATE_DATE_FIELDS.map(field=>[field,field==='dateOfBirth'?'15/01/1990':field==='validUntil'?'01/01/2029':'01/01/2026']));
  dateDb.prepare('UPDATE certificates SET '+CERTIFICATE_DATE_FIELDS.map(field=>field+'=?').join(',')+' WHERE id=?').run(...CERTIFICATE_DATE_FIELDS.map(field=>legacyDates[field]),a.data.data.id);
  const legacyDetail=await request('/api/admin/certificates/'+a.data.data.id,'GET',undefined,admin);
  const legacyList=await request('/api/admin/certificates?search='+encodeURIComponent(a.data.data.certificateNumber),'GET',undefined,admin);
  check('Admin list and detail expose every legacy certificate date in native input ISO format',()=>{
    assert.equal(legacyDetail.status,200);assert.equal(legacyList.status,200);
    for(const field of CERTIFICATE_DATE_FIELDS){assert.match(legacyDetail.data.data[field],/^\d{4}-\d{2}-\d{2}$/);assert.equal(legacyDetail.data.data[field],legacyList.data.items[0][field]);}
    assert.equal(dateDb.prepare('SELECT dateOfBirth FROM certificates WHERE id=?').get(a.data.data.id).dateOfBirth,'15/01/1990');
  });
  const legacyQr=await request('/api/public/verify-certificate/'+a.data.data.qrToken);
  const legacyLookup=await request('/api/public/lookup','POST',query);
  const legacyIntegration=await verify(issuedKey.data.apiKey);
  check('QR, public lookup and API-key verification agree on dates from legacy storage',()=>{
    for(const response of [legacyQr,legacyLookup,legacyIntegration])assert.equal(response.status,200);
    assert.equal(legacyQr.data.data.dateOfBirthMasked,'15/01/1990');
    assert.equal(legacyLookup.data.data.find(c=>c.certificateNumber===a.data.data.certificateNumber).dateOfBirthMasked,'15/01/1990');
    assert.equal(legacyIntegration.data.data.find(c=>c.certificateNumber===a.data.data.certificateNumber).dateOfBirthMasked,'15/01/1990');
  });
  const legacyRoundTrip=await request('/api/admin/certificates/'+a.data.data.id,'PUT',{...legacyDetail.data.data,notes:'Round trip without date edits'},admin);
  const afterLegacySave=await request('/api/admin/certificates/'+a.data.data.id,'GET',undefined,admin);
  check('Saving the edit-form payload preserves birth, issue and expiration dates and certificate links',()=>{
    assert.equal(legacyRoundTrip.status,200,JSON.stringify(legacyRoundTrip.data));assert.equal(afterLegacySave.status,200);
    for(const field of CERTIFICATE_DATE_FIELDS)assert.equal(afterLegacySave.data.data[field],legacyDetail.data.data[field]);
    assert.equal(afterLegacySave.data.data.qrToken,a.data.data.qrToken);assert.equal(afterLegacySave.data.data.certificateNumber,a.data.data.certificateNumber);
    assert.equal(dateDb.prepare('SELECT dateOfBirth FROM certificates WHERE id=?').get(a.data.data.id).dateOfBirth,'1990-01-15');
  });
  dateDb.close();
  for(const url of ['/server.cjs','/server.cjs.map']) {
    const r=await request(url);
    check('Backend artifact is not served '+url,()=>assert.ok(!r.data.text?.includes('activeSessions')));
  }
  const spoof1=await request('/api/public/security-config','GET',undefined,undefined,{'X-Forwarded-For':'192.0.2.1'});
  const spoof2=await request('/api/public/security-config','GET',undefined,undefined,{'X-Forwarded-For':'192.0.2.2'});
  check('Spoofed forwarding headers share the same rate limit bucket',()=>assert.equal(Number(spoof1.headers.get('ratelimit-remaining'))-1,Number(spoof2.headers.get('ratelimit-remaining'))));
  await request('/api/security/log-event','POST',{action:'DELETE_USER',target:'admin',details:{by:'admin'}});
  const logs=await request('/api/admin/audit-logs','GET',undefined,admin);
  check('Client logs cannot impersonate server audit events',()=>assert.ok(logs.data.data.some(r=>r.action==='CLIENT_EVENT' && JSON.parse(r.details).reportedAction==='DELETE_USER')));
  const unknown=await request('/api/nonexistent');
  check('Unknown API paths return JSON 404',()=>assert.equal(unknown.status,404));
  const snapshot = await backupDatabase(path.join(sandbox,'app.db'),path.join(sandbox,'snapshot.db'));
  const snapshotDb = new DatabaseSync(snapshot,{readOnly:true});
  const snapshotCount = snapshotDb.prepare('SELECT COUNT(*) AS n FROM certificates').get().n;
  snapshotDb.close();
  check('Online SQLite snapshot includes committed records and passes integrity check',()=>assert.ok(snapshotCount>0));
  check('Certificate stays valid through its final Vietnam calendar day',()=>{
    assert.equal(effectiveStatus({status:'ISSUED',validUntil:'21/10/2026'},'2026-10-21'),'ISSUED');
    assert.equal(effectiveStatus({status:'ISSUED',validUntil:'21/10/2026'},'2026-10-22'),'EXPIRED');
    assert.equal(todayVN(new Date('2026-10-21T17:00:00Z')),'2026-10-22');
    assert.equal(effectiveStatus({status:'REVOKED',validUntil:'2020-01-01'},'2026-10-22'),'REVOKED');
    assert.equal(effectiveStatus({status:'PENDING',validUntil:'2020-01-01'},'2026-10-22'),'PENDING');
  });
  await stop();
  const db=new DatabaseSync(path.join(sandbox,'app.db'));
  const hash=db.prepare("SELECT passwordHash FROM users WHERE username='admin'").get().passwordHash;
  check('Passwords stored using scrypt with individual salt',()=>assert.match(hash,/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/));
  const legacy=crypto.createHash('sha256').update(password+'_driver_edu_secure_salt_2026').digest('hex');
  db.prepare("UPDATE users SET passwordHash=? WHERE username='admin'").run(legacy);
  db.close();
  await start(false);
  admin=await login('admin');
  const persistedUse=await verify(issuedKey.data.apiKey);
  const persistedDb=new DatabaseSync(path.join(sandbox,'app.db'),{readOnly:true});
  check('API keys and their quota counters survive server restart',()=>{assert.equal(persistedUse.status,200);assert.equal(persistedDb.prepare('SELECT requestCount FROM api_keys WHERE id=?').get(limitedKey.data.data.id).requestCount,2);});
  persistedDb.close();
  await stop();
  const migrated=new DatabaseSync(path.join(sandbox,'app.db'));
  check('Legacy non-demo passwords migrate on successful login',()=>assert.match(migrated.prepare("SELECT passwordHash FROM users WHERE username='admin'").get().passwordHash,/^scrypt\$/));
  const demoHash=crypto.createHash('sha256').update('Admin@2026!'+'_driver_edu_secure_salt_2026').digest('hex');
  migrated.prepare("UPDATE users SET passwordHash=? WHERE username='admin'").run(demoHash); migrated.close();
  await start(false);
  const retired=await request('/api/auth/login','POST',{username:'admin',password:'Admin@2026!'});
  check('Previously seeded production password is retired on startup',()=>assert.equal(retired.status,401));
  const unauthenticatedStop = await request('/api/internal/stop','POST',{});
  check('Application cannot be stopped without its instance secret',()=>assert.equal(unauthenticatedStop.status,403));
  const gracefulExit = new Promise(resolve=>child.once('exit',resolve));
  const authenticatedStop = await request('/api/internal/stop','POST',{},stopToken);
  check('Authenticated local stop exits gracefully',()=>assert.equal(authenticatedStop.status,200));
  await gracefulExit;
  console.log(`\n${checks} regression checks passed. Database isolated at ${sandbox}`);
} catch (error) {
  console.error(error);
  process.exitCode=1;
} finally { await stop(); }
