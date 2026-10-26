import crypto from 'node:crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { db, logSecurityEvent, toPublicCertificate, CERTIFICATE_STATUS_SQL } from './db';
import { InputError, isoDate } from './rules';

// Raw keys are returned once. Only a SHA-256 digest of a random 256-bit secret is persisted.
db.exec(`CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, organization TEXT NOT NULL,
  keyHash TEXT UNIQUE NOT NULL, keyPrefix TEXT NOT NULL,
  schoolCode TEXT, status TEXT NOT NULL DEFAULT 'ACTIVE',
  expiresAt TEXT NOT NULL, createdAt TEXT NOT NULL, createdBy TEXT NOT NULL,
  revokedAt TEXT, lastUsedAt TEXT, lastUsedIp TEXT,
  requestCount INTEGER NOT NULL DEFAULT 0, rateLimit INTEGER NOT NULL DEFAULT 30,
  windowStart INTEGER NOT NULL DEFAULT 0, windowCount INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS api_key_usage (
  id TEXT PRIMARY KEY, apiKeyId TEXT NOT NULL, timestamp TEXT NOT NULL,
  ip TEXT NOT NULL, httpStatus INTEGER NOT NULL, resultCount INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_api_usage_key_time ON api_key_usage(apiKeyId, timestamp);`);

function metadata(row: any) {
  return {
    id:row.id,name:row.name,organization:row.organization,keyPrefix:row.keyPrefix,
    schoolCode:row.schoolCode || null,
    status:row.status==='REVOKED'?'REVOKED':Date.parse(row.expiresAt)<=Date.now()?'EXPIRED':'ACTIVE',
    expiresAt:row.expiresAt,createdAt:row.createdAt,createdBy:row.createdBy,
    revokedAt:row.revokedAt,lastUsedAt:row.lastUsedAt,lastUsedIp:row.lastUsedIp,
    requestCount:row.requestCount,rateLimit:row.rateLimit,
  };
}

function usage(keyId: string, status: number, resultCount: number, ip: string, requestId: string) {
  db.prepare('INSERT INTO api_key_usage(id,apiKeyId,timestamp,ip,httpStatus,resultCount) VALUES (?,?,?,?,?,?)')
    .run(requestId,keyId,new Date().toISOString(),ip,status,resultCount);
  db.prepare('DELETE FROM api_key_usage WHERE id IN (SELECT id FROM api_key_usage ORDER BY timestamp DESC, rowid DESC LIMIT -1 OFFSET 10000)').run();
}

export function mountIntegration(app: express.Express, auth: express.RequestHandler, superadmin: express.RequestHandler) {
  app.get('/api/admin/api-keys',auth,superadmin,(_req,res)=>{
    const rows=db.prepare('SELECT * FROM api_keys ORDER BY createdAt DESC').all();
    res.json({success:true,data:rows.map(metadata)});
  });

  app.post('/api/admin/api-keys',auth,superadmin,(req,res)=>{
    const {name,organization,schoolCode,expiresAt,rateLimit:limit=30}=req.body || {};
    if(typeof name!=='string' || name.trim().length<3 || name.length>120 || typeof organization!=='string' || organization.trim().length<2 || organization.length>200) throw new InputError('Nhập tên ứng dụng (3–120 ký tự) và đơn vị sử dụng (2–200 ký tự).');
    if(schoolCode!==undefined && schoolCode!==null && (typeof schoolCode!=='string' || !schoolCode)) throw new InputError('Phạm vi cơ sở không hợp lệ.');
    if(schoolCode && !db.prepare('SELECT id FROM schools WHERE code = ? AND isActive = 1').get(schoolCode)) throw new InputError('Cơ sở không tồn tại hoặc đã ngừng hoạt động.');
    const expiry=typeof expiresAt==='string'?Date.parse(expiresAt):NaN;
    if(!Number.isFinite(expiry) || !isoDate(expiresAt.slice(0,10)) || !/(Z|[+-]\d{2}:\d{2})$/.test(expiresAt) || expiry<=Date.now() || expiry>Date.now()+365*86400000) throw new InputError('Thời hạn API key phải là ISO có múi giờ, trong tương lai và không quá 365 ngày.');
    if(!Number.isInteger(limit) || limit<1 || limit>120) throw new InputError('Giới hạn mỗi phút phải từ 1 đến 120 request.');
    const raw='dtv_'+crypto.randomBytes(32).toString('hex');
    const id=crypto.randomUUID(), now=new Date().toISOString();
    const user=(req as any).user;
    db.prepare('INSERT INTO api_keys(id,name,organization,keyHash,keyPrefix,schoolCode,expiresAt,createdAt,createdBy,rateLimit) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(id,name.trim(),organization.trim(),crypto.createHash('sha256').update(raw).digest('hex'),raw.slice(0,12),schoolCode || null,new Date(expiry).toISOString(),now,user.id,limit);
    logSecurityEvent('CREATE_API_KEY',id,req.ip || '',req.headers['user-agent'] || '',{by:user.username,name,schoolCode:schoolCode || null});
    const row=db.prepare('SELECT * FROM api_keys WHERE id = ?').get(id);
    res.status(201).json({success:true,apiKey:raw,data:metadata(row)});
  });

  app.delete('/api/admin/api-keys/:id',auth,superadmin,(req,res)=>{
    const row=db.prepare('SELECT * FROM api_keys WHERE id = ?').get(req.params.id) as any;
    if(!row) return res.status(404).json({error:'Không tìm thấy API key.'});
    if(row.status!=='REVOKED') {
      db.prepare("UPDATE api_keys SET status='REVOKED',revokedAt=? WHERE id=?").run(new Date().toISOString(),row.id);
      logSecurityEvent('REVOKE_API_KEY',row.id,req.ip || '',req.headers['user-agent'] || '',{by:(req as any).user.username});
    }
    res.json({success:true,message:'API key đã được thu hồi.'});
  });

  app.get('/api/admin/api-keys/:id/usage',auth,superadmin,(req,res)=>{
    if(!db.prepare('SELECT id FROM api_keys WHERE id = ?').get(req.params.id)) return res.status(404).json({error:'Không tìm thấy API key.'});
    const rows=db.prepare('SELECT id,timestamp,ip,httpStatus,resultCount FROM api_key_usage WHERE apiKeyId = ? ORDER BY timestamp DESC, rowid DESC LIMIT 50').all(req.params.id);
    res.json({success:true,data:rows});
  });

  const ipLimiter=rateLimit({windowMs:60000,limit:120,standardHeaders:true,legacyHeaders:false,message:{success:false,error:'Quá nhiều request từ địa chỉ IP này. Vui lòng thử lại sau.'}});
  app.post('/api/v1/certificates/verify',ipLimiter,(req,res)=>{
    const raw=req.headers['x-api-key'];
    const requestId=crypto.randomUUID();
    res.setHeader('X-Request-Id',requestId);
    if(typeof raw!=='string' || !/^dtv_[a-f0-9]{64}$/.test(raw)) return res.status(401).json({success:false,error:'API key không hợp lệ hoặc đã hết hạn.'});
    const row=db.prepare('SELECT k.* FROM api_keys k JOIN users u ON u.id=k.createdBy WHERE k.keyHash=? AND u.status=? AND u.role=?')
      .get(crypto.createHash('sha256').update(raw).digest('hex'),'ACTIVE','SUPERADMIN') as any;
    if(!row || row.status!=='ACTIVE' || Date.parse(row.expiresAt)<=Date.now()) return res.status(401).json({success:false,error:'API key không hợp lệ hoặc đã hết hạn.'});
    if(row.schoolCode && !db.prepare('SELECT id FROM schools WHERE code=? AND isActive=1').get(row.schoolCode)) return res.status(403).json({success:false,error:'Phạm vi cơ sở đã bị vô hiệu hóa.'});
    const now=Date.now(), windowStart=Math.floor(now/60000)*60000, ip=req.ip || '';
    const counter=db.prepare("UPDATE api_keys SET windowCount=CASE WHEN windowStart=? THEN windowCount+1 ELSE 1 END,windowStart=?,requestCount=requestCount+1,lastUsedAt=?,lastUsedIp=? WHERE id=? AND status='ACTIVE' RETURNING windowCount")
      .get(windowStart,windowStart,new Date(now).toISOString(),ip,row.id) as any;
    if(!counter) return res.status(401).json({success:false,error:'API key đã bị thu hồi.'});
    res.setHeader('X-RateLimit-Limit',String(row.rateLimit));
    res.setHeader('X-RateLimit-Remaining',String(Math.max(0,row.rateLimit-counter.windowCount)));
    if(counter.windowCount>row.rateLimit) {
      res.setHeader('Retry-After',String(Math.max(1,Math.ceil((windowStart+60000-now)/1000))));
      usage(row.id,429,0,ip,requestId);
      return res.status(429).json({success:false,error:'API key đã vượt giới hạn request mỗi phút.',requestId});
    }
    const {cccd,licenseNumber}=req.body || {};
    const hasCccd=cccd!==undefined, hasLicense=licenseNumber!==undefined;
    const identifier=hasLicense?licenseNumber:cccd;
    if(hasCccd===hasLicense || typeof identifier!=='string' || !/^\d{12}$/.test(identifier)) {
      usage(row.id,400,0,ip,requestId);
      return res.status(400).json({success:false,error:'Gửi đúng một trường cccd hoặc licenseNumber là chuỗi gồm 12 chữ số.',requestId});
    }
    // Column names come only from this allowlist, never from request input.
    const column=hasLicense?'licenseNumber':'cccdNumber';
    const where=' WHERE '+column+'=?'+(row.schoolCode?' AND schoolCode=?':'');
    const params=row.schoolCode?[identifier,row.schoolCode]:[identifier];
    const summary=db.prepare('SELECT COUNT(*) AS n, MAX(CASE WHEN ('+CERTIFICATE_STATUS_SQL+")='ISSUED' THEN 1 ELSE 0 END) AS hasValid FROM certificates"+where).get(...params) as any;
    const total=Number(summary.n);
    const records=db.prepare('SELECT * FROM certificates'+where+' ORDER BY issueDate DESC, createdAt DESC LIMIT 100').all(...params);
    const data=records.map(record=>{
      // Share the QR verification DTO so both integrations expose the same certificate fields.
      const cert=toPublicCertificate(record,true);
      return {...cert,isValid:cert.isIssued};
    });
    usage(row.id,200,data.length,ip,requestId);
    res.json({success:true,requestId,count:data.length,total,truncated:total>data.length,hasValidCertificate:Boolean(summary.hasValid),data});
  });
}
