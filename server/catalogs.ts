import crypto from 'node:crypto';
import express from 'express';
import { db, logSecurityEvent } from './db';
import { InputError } from './rules';

const catalogs = [
  {path:'training-programs',table:'training_programs',fields:['description','durationHours'],event:'TRAINING_PROGRAM'},
  {path:'transport-units',table:'transport_units',fields:['taxCode','businessLicense','address','phone','email','contactPerson'],event:'TRANSPORT_UNIT'},
] as const;

db.exec(`CREATE TABLE IF NOT EXISTS training_programs (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '', durationHours TEXT NOT NULL DEFAULT '',
  isActive INTEGER NOT NULL DEFAULT 1, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS transport_units (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
  taxCode TEXT NOT NULL DEFAULT '', businessLicense TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', contactPerson TEXT NOT NULL DEFAULT '',
  isActive INTEGER NOT NULL DEFAULT 1, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
);`);

export function mountCatalogs(app:express.Express,auth:express.RequestHandler,superadmin:express.RequestHandler) {
  for(const catalog of catalogs) {
    const columns=['code','name',...catalog.fields,'isActive'];
    const dto=(row:any)=>({...row,isActive:!!row.isActive});
    const validate=(body:any,existing?:any)=>{
      const input={...existing,...body}, values:Record<string,string|number>={};
      for(const field of ['code','name',...catalog.fields]) {
        const value=input[field]??'';
        if(typeof value!=='string' || value.length>(field==='description'?4000:field==='address'?500:field==='name'?250:160)) throw new InputError('Nội dung '+field+' không hợp lệ hoặc quá dài.');
        values[field]=value.trim();
      }
      if(!/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(String(values.code))) throw new InputError('Mã gồm 2–64 ký tự chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.');
      values.code=String(values.code).toUpperCase();
      if(String(values.name).length<2) throw new InputError('Tên phải có ít nhất 2 ký tự.');
      if(input.isActive!==undefined && typeof input.isActive!=='boolean') throw new InputError('Trạng thái hoạt động phải là boolean.');
      values.isActive=input.isActive===false?0:1;
      if(catalog.path==='training-programs' && values.durationHours && (!/^\d{1,4}$/.test(String(values.durationHours)) || Number(values.durationHours)<1 || Number(values.durationHours)>1000)) throw new InputError('Thời lượng phải là số giờ nguyên từ 1 đến 1000, hoặc để trống.');
      if(catalog.path==='transport-units') {
        if(values.taxCode && !/^\d{10}(?:-?\d{3})?$/.test(String(values.taxCode))) throw new InputError('Mã số thuế gồm 10 hoặc 13 chữ số (có thể có dấu gạch trước mã chi nhánh).');
        if(values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(values.email))) throw new InputError('Email không hợp lệ.');
        if(values.phone && !/^[+\d\s().-]{6,25}$/.test(String(values.phone))) throw new InputError('Số điện thoại không hợp lệ.');
      }
      return values;
    };
    app.get('/api/admin/'+catalog.path,auth,(req,res)=>{
      const search=req.query.search??'',status=req.query.status??'ALL';
      const limit=Number(req.query.limit??50),offset=Number(req.query.offset??0);
      if(typeof search!=='string'||search.length>250||!['ALL','ACTIVE','DISABLED'].includes(String(status))||!Number.isInteger(limit)||limit<1||limit>200||!Number.isInteger(offset)||offset<0) throw new InputError('Bộ lọc hoặc phân trang không hợp lệ.');
      const where=' WHERE (code LIKE ? OR name LIKE ?)'+(status==='ALL'?'':' AND isActive='+ (status==='ACTIVE'?'1':'0'));
      const params=['%'+search+'%','%'+search+'%'];
      const rows=db.prepare('SELECT * FROM '+catalog.table+where+' ORDER BY isActive DESC,name COLLATE NOCASE,id LIMIT ? OFFSET ?').all(...params,limit,offset);
      const total=(db.prepare('SELECT COUNT(*) AS n FROM '+catalog.table+where).get(...params) as any).n;
      res.json({success:true,data:rows.map(dto),total});
    });
    app.post('/api/admin/'+catalog.path,auth,superadmin,(req,res)=>{
      const data=validate(req.body),id=crypto.randomUUID(),now=new Date().toISOString();
      db.prepare('INSERT INTO '+catalog.table+' (id,'+columns.join(',')+',createdAt,updatedAt) VALUES ('+Array(columns.length+3).fill('?').join(',')+')')
        .run(id,...columns.map(c=>data[c]),now,now);
      logSecurityEvent('CREATE_'+catalog.event,id,req.ip||'',req.headers['user-agent']||'',{by:(req as any).user.username,code:data.code});
      res.status(201).json({success:true,data:dto(db.prepare('SELECT * FROM '+catalog.table+' WHERE id=?').get(id))});
    });
    app.put('/api/admin/'+catalog.path+'/:id',auth,superadmin,(req,res)=>{
      const existing=db.prepare('SELECT * FROM '+catalog.table+' WHERE id=?').get(req.params.id) as any;
      if(!existing)return res.status(404).json({error:'Không tìm thấy dữ liệu.'});
      const data=validate(req.body,{...existing,isActive:!!existing.isActive});
      db.prepare('UPDATE '+catalog.table+' SET '+columns.map(c=>c+'=?').join(',')+',updatedAt=? WHERE id=?')
        .run(...columns.map(c=>data[c]),new Date().toISOString(),existing.id);
      logSecurityEvent('UPDATE_'+catalog.event,existing.id,req.ip||'',req.headers['user-agent']||'',{by:(req as any).user.username,code:data.code,isActive:!!data.isActive});
      res.json({success:true,data:dto(db.prepare('SELECT * FROM '+catalog.table+' WHERE id=?').get(existing.id))});
    });
  }
}
