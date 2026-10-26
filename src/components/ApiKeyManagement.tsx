import React, { useEffect, useState } from 'react';
import { KeyRound, Plus, RefreshCw, Copy, Check, ShieldCheck, AlertCircle, Search, LoaderCircle, Ban, History, X, Code2 } from 'lucide-react';
import { IntegrationApiKey } from '../types';
import { apiFetch } from '../utils/api';

type Usage = {id:string;timestamp:string;ip:string;httpStatus:number;resultCount:number};
const date = (value:string|null) => value ? new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}) : 'Chưa sử dụng';

export const ApiKeyManagement: React.FC<{token:string}> = ({token}) => {
  const [keys,setKeys]=useState<IntegrationApiKey[]>([]),[schools,setSchools]=useState<{code:string;name:string}[]>([]);
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  const [showCreate,setShowCreate]=useState(false),[saving,setSaving]=useState(false);
  const [name,setName]=useState(''),[organization,setOrganization]=useState(''),[schoolCode,setSchoolCode]=useState('');
  const [expiresOn,setExpiresOn]=useState(new Date(Date.now()+90*86400000).toISOString().slice(0,10));
  const [limit,setLimit]=useState(30),[issued,setIssued]=useState(''),[copied,setCopied]=useState(false);
  const [revoking,setRevoking]=useState<string|null>(null),[pendingRevoke,setPendingRevoke]=useState<IntegrationApiKey|null>(null);
  const [selected,setSelected]=useState<IntegrationApiKey|null>(null),[logs,setLogs]=useState<Usage[]>([]),[logsLoading,setLogsLoading]=useState(false),[logsError,setLogsError]=useState('');
  const [testKey,setTestKey]=useState(''),[identifier,setIdentifier]=useState(''),[lookupType,setLookupType]=useState<'cccd'|'licenseNumber'>('cccd'),[testing,setTesting]=useState(false),[testResult,setTestResult]=useState('');
  const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};

  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');
    apiFetch('/api/admin/api-keys',{headers:{Authorization:'Bearer '+token},signal:controller.signal})
      .then(async response=>{const data=await response.json();if(!response.ok||!data.success)throw new Error(data.error||'Không tải được API key.');if(!controller.signal.aborted)setKeys(data.data);})
      .catch(err=>{if(!controller.signal.aborted)setError(err instanceof Error?err.message:'Không thể kết nối.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[token,revision]);
  useEffect(()=>{
    const controller=new AbortController();
    apiFetch('/api/public/schools',{signal:controller.signal}).then(response=>response.json()).then(result=>{
      if(!controller.signal.aborted){const active=(result.data||[]).filter(school=>school.isActive);setSchools(active);setSchoolCode(active[0]?.code||'');}
    }).catch(()=>{});
    return ()=>controller.abort();
  },[]);
  useEffect(()=>{
    if(!selected)return;
    const controller=new AbortController();setLogsLoading(true);setLogsError('');setLogs([]);
    apiFetch('/api/admin/api-keys/'+selected.id+'/usage',{headers:{Authorization:'Bearer '+token},signal:controller.signal})
      .then(async response=>{const result=await response.json();if(!response.ok)throw new Error(result.error||'Không tải được lịch sử.');if(!controller.signal.aborted)setLogs(result.data);})
      .catch(err=>{if(!controller.signal.aborted)setLogsError(err.message||'Không thể kết nối.');})
      .finally(()=>{if(!controller.signal.aborted)setLogsLoading(false);});
    return ()=>controller.abort();
  },[selected,token]);

  const create=async(event:React.FormEvent)=>{
    event.preventDefault();setSaving(true);setError('');
    try {
      const response=await apiFetch('/api/admin/api-keys',{method:'POST',headers,body:JSON.stringify({name,organization,schoolCode:schoolCode||null,expiresAt:new Date(expiresOn+'T23:59:59+07:00').toISOString(),rateLimit:limit})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'Không thể cấp khóa.');
      setIssued(result.apiKey);setCopied(false);setShowCreate(false);setName('');setOrganization('');setRevision(value=>value+1);
    } catch(err){setError(err instanceof Error?err.message:'Không thể kết nối.');} finally{setSaving(false);}
  };
  const revoke=async()=>{
    if(!pendingRevoke)return;setRevoking(pendingRevoke.id);setError('');
    try{const response=await apiFetch('/api/admin/api-keys/'+pendingRevoke.id,{method:'DELETE',headers});const result=await response.json();if(!response.ok)throw new Error(result.error);setPendingRevoke(null);setRevision(value=>value+1);}
    catch(err){setError(err instanceof Error?err.message:'Không thể thu hồi.');}finally{setRevoking(null);}
  };
  const test=async(event:React.FormEvent)=>{
    event.preventDefault();setTesting(true);setTestResult('');
    try{const response=await apiFetch('/api/v1/certificates/verify',{method:'POST',headers:{'Content-Type':'application/json','X-API-Key':testKey.trim()},body:JSON.stringify({[lookupType]:identifier})});const result=await response.json();setTestResult('HTTP '+response.status+'\n'+JSON.stringify(result,null,2));setRevision(value=>value+1);}
    catch{setTestResult('Không thể kết nối máy chủ.');}finally{setTesting(false);}
  };

  return <div className="integration-page">
    <div className="dashboard-heading"><div><div className="eyebrow"><span/>KẾT NỐI HỆ THỐNG</div><h1>API tích hợp</h1><p>Cấp quyền tra cứu chứng nhận theo CCCD hoặc GPLX cho các ứng dụng được phép.</p></div><div className="integration-heading-actions"><button className="dashboard-refresh" disabled={loading} onClick={()=>setRevision(value=>value+1)} aria-label="Làm mới API key"><RefreshCw size={16}/></button><button className="primary-button" onClick={()=>{setShowCreate(!showCreate);setError('');}}><Plus size={16}/>{showCreate?'Đóng biểu mẫu':'Cấp API key'}</button></div></div>
    {error&&<div className="lookup-alert" role="alert"><AlertCircle size={18}/>{error}</div>}
    {issued&&<section className="integration-secret"><div><ShieldCheck size={22}/><h2>API key đã được cấp</h2></div><p>Sao chép và lưu tại hệ thống sử dụng. Khóa gốc chỉ xuất hiện lần này; khi đóng hoặc rời trang sẽ không xem lại được.</p><div className="integration-key-copy"><input aria-label="API key vừa cấp" readOnly value={issued}/><button className="dashboard-refresh" onClick={async()=>{try{await navigator.clipboard.writeText(issued);setCopied(true);}catch{setError('Không thể sao chép tự động. Vui lòng chọn và sao chép khóa.');}}}>{copied?<Check size={16}/>:<Copy size={16}/>}Sao chép</button></div><button className="dashboard-text-link" onClick={()=>setIssued('')}>Đã lưu khóa, đóng thông báo <X size={14}/></button></section>}
    {showCreate&&<section className="dashboard-panel integration-create"><h2>Cấp khóa cho ứng dụng</h2><form onSubmit={create} className="integration-form"><div className="form-field"><label htmlFor="key-name">Tên ứng dụng</label><input id="key-name" minLength={3} maxLength={120} required value={name} onChange={e=>setName(e.target.value)} placeholder="Ví dụ: Cổng quản lý vận tải"/></div><div className="form-field"><label htmlFor="key-organization">Đơn vị sử dụng</label><input id="key-organization" minLength={2} maxLength={200} required value={organization} onChange={e=>setOrganization(e.target.value)} placeholder="Tên đơn vị được cấp quyền"/></div><div className="form-field"><label htmlFor="key-scope">Phạm vi dữ liệu</label><select id="key-scope" value={schoolCode} onChange={e=>setSchoolCode(e.target.value)}><option value="">Toàn hệ thống</option>{schools.map(school=><option key={school.code} value={school.code}>{school.name}</option>)}</select></div><div className="form-field"><label htmlFor="key-expiry">Ngày hết hạn</label><input id="key-expiry" type="date" required min={new Date().toISOString().slice(0,10)} max={new Date(Date.now()+364*86400000).toISOString().slice(0,10)} value={expiresOn} onChange={e=>setExpiresOn(e.target.value)}/></div><div className="form-field"><label htmlFor="key-limit">Request mỗi phút (1–120)</label><input id="key-limit" type="number" required min={1} max={120} value={limit} onChange={e=>setLimit(Number(e.target.value))}/></div><div className="integration-create-action"><button className="primary-button" disabled={saving}>{saving?<LoaderCircle size={16} className="animate-spin"/>:<KeyRound size={16}/>}Cấp khóa</button></div></form></section>}
    <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><span className="eyebrow">QUẢN LÝ QUYỀN TRUY CẬP</span><h2>Danh sách API key</h2><p>Chỉ hiển thị tiền tố nhận diện; không thể truy xuất lại khóa gốc.</p></div><span className="dashboard-count-pill">{keys.length} khóa</span></div><div className="integration-table-scroll"><table className="integration-table"><thead><tr><th>Ứng dụng / Đơn vị</th><th>Khóa / Phạm vi</th><th>Hạn mức</th><th>Trạng thái / Hết hạn</th><th>Lần dùng gần nhất</th><th>Thao tác</th></tr></thead><tbody>{keys.map(key=><tr key={key.id}><td><strong>{key.name}</strong><small>{key.organization}</small></td><td><code>{key.keyPrefix}…</code><small>{key.schoolCode||'Toàn hệ thống'}</small></td><td>{key.rateLimit}/phút<small>{key.requestCount.toLocaleString('vi-VN')} request</small></td><td><span className={'dashboard-status state-'+(key.status==='ACTIVE'?'issued':key.status==='REVOKED'?'revoked':'expired')}>{key.status==='ACTIVE'?'Đang hoạt động':key.status==='REVOKED'?'Đã thu hồi':'Hết hạn'}</span><small>{date(key.expiresAt)}</small></td><td>{date(key.lastUsedAt)}<small>{key.lastUsedIp||'—'}</small></td><td><div className="integration-row-actions"><button className="icon-button" onClick={()=>setSelected(key)} aria-label={'Lịch sử '+key.name}><History size={16}/></button>{key.status!=='REVOKED'&&<button className="icon-button integration-revoke" onClick={()=>setPendingRevoke(key)} aria-label={'Thu hồi '+key.name}><Ban size={16}/></button>}</div></td></tr>)}</tbody></table>{!keys.length&&<div className="dashboard-empty">{loading?<LoaderCircle className="animate-spin" size={28}/>:<KeyRound size={28}/>}<h3>{loading?'Đang tải danh sách':'Chưa có API key'}</h3><p>Cấp khóa riêng cho từng ứng dụng để quản lý phạm vi và thu hồi khi cần.</p></div>}</div></section>
    {pendingRevoke&&<section className="integration-confirm" role="alert"><Ban size={20}/><div><strong>Thu hồi khóa “{pendingRevoke.name}”?</strong><p>Ứng dụng dùng khóa này sẽ không tra cứu được nữa. Có thể cấp khóa mới để thay thế.</p></div><button className="dashboard-refresh" onClick={()=>setPendingRevoke(null)} disabled={!!revoking}>Hủy</button><button className="primary-button" onClick={revoke} disabled={!!revoking}>Xác nhận thu hồi</button></section>}
    {selected&&<section className="dashboard-panel integration-usage"><div className="dashboard-panel-heading"><div><span className="eyebrow">50 REQUEST GẦN NHẤT</span><h2>Lịch sử · {selected.name}</h2><p>Không ghi số CCCD hoặc nội dung khóa vào nhật ký này.</p></div><button className="icon-button" onClick={()=>setSelected(null)} aria-label="Đóng lịch sử"><X size={16}/></button></div>{logsLoading?<p className="integration-note">Đang tải lịch sử…</p>:logsError?<p className="integration-note" role="alert">{logsError}</p>:<div className="integration-table-scroll"><table className="integration-table"><thead><tr><th>Thời điểm</th><th>IP</th><th>HTTP</th><th>Số kết quả</th></tr></thead><tbody>{logs.map(log=><tr key={log.id}><td>{date(log.timestamp)}</td><td>{log.ip}</td><td>{log.httpStatus}</td><td>{log.resultCount}</td></tr>)}</tbody></table>{!logs.length&&<p className="integration-note">Chưa có request được ghi nhận.</p>}</div>}</section>}
    <div className="integration-bottom"><section className="dashboard-panel integration-doc"><Code2 size={22}/><h2>Tra cứu chứng nhận qua API</h2><p>Gửi một CCCD hoặc số GPLX mỗi request từ backend của ứng dụng tích hợp. Kết quả đầy đủ như xác thực QR: CCCD, GPLX, ngày sinh, địa chỉ, khóa học, kết quả kiểm tra và thông tin chứng nhận. Điện thoại vẫn che như endpoint QR.</p><pre>{'POST /api/v1/certificates/verify\nContent-Type: application/json\nX-API-Key: <API_KEY>\n\n{"cccd":"000000000001"}\n\nHoặc tra cứu GPLX:\n{"licenseNumber":"000000000002"}'}</pre><small>Không nhúng API key vào mã frontend, URL hoặc repository. Dùng HTTPS khi tích hợp ngoài máy cục bộ.</small></section><section className="dashboard-panel integration-tester"><h2>Kiểm tra kết nối</h2><p>Request thử cũng tính vào hạn mức của khóa.</p><form onSubmit={test} className="lookup-form"><div className="form-field"><label htmlFor="test-api-key">API key</label><input id="test-api-key" type="password" autoComplete="off" required value={testKey} onChange={e=>setTestKey(e.target.value)} placeholder="Dán API key đã cấp"/></div><div className="form-field"><label htmlFor="test-lookup-type">Giấy tờ tra cứu</label><select id="test-lookup-type" value={lookupType} onChange={e=>{setLookupType(e.target.value as 'cccd'|'licenseNumber');setIdentifier('');setTestResult('');}}><option value="cccd">Căn cước công dân</option><option value="licenseNumber">Giấy phép lái xe</option></select></div><div className="form-field"><label htmlFor="test-identifier">{lookupType==='cccd'?'Số CCCD':'Số GPLX'}</label><input id="test-identifier" required inputMode="numeric" pattern="[0-9]{12}" maxLength={12} value={identifier} onChange={e=>setIdentifier(e.target.value.replace(/\D/g,''))} placeholder="12 chữ số"/></div><button className="primary-button" disabled={testing}>{testing?<LoaderCircle size={16} className="animate-spin"/>:<Search size={16}/>}Kiểm tra API</button></form>{testResult&&<pre className="integration-test-result" aria-live="polite">{testResult}</pre>}</section></div>
  </div>;
};
