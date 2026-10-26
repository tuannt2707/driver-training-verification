import React,{useEffect,useState} from 'react';
import {Plus,Search,RefreshCw,Pencil,BookOpen,Truck,X,LoaderCircle} from 'lucide-react';
import {apiFetch} from '../utils/api';
import {AdminUser} from '../types';

export type CatalogKind='training-programs'|'transport-units';
export interface CatalogEntry {
  id:string;code:string;name:string;isActive:boolean;createdAt:string;updatedAt:string;
  description?:string;durationHours?:string;taxCode?:string;businessLicense?:string;
  address?:string;phone?:string;email?:string;contactPerson?:string;
}
const configs={
  'training-programs':{title:'Chương trình tập huấn',singular:'chương trình',icon:BookOpen,fields:[['description','Nội dung / Mô tả'],['durationHours','Thời lượng (giờ)']]},
  'transport-units':{title:'Đơn vị kinh doanh vận tải',singular:'đơn vị',icon:Truck,fields:[['taxCode','Mã số thuế'],['businessLicense','Số giấy phép kinh doanh vận tải'],['address','Địa chỉ'],['phone','Điện thoại'],['email','Email'],['contactPerson','Người liên hệ']]},
};
export const CatalogManagement:React.FC<{kind:CatalogKind;token:string;currentUser:AdminUser}>=({kind,token,currentUser})=>{
  const config=configs[kind],Icon=config.icon,canEdit=currentUser.role==='SUPERADMIN';
  const [rows,setRows]=useState<CatalogEntry[]>([]),[total,setTotal]=useState(0),[offset,setOffset]=useState(0);
  const [search,setSearch]=useState(''),[status,setStatus]=useState('ALL'),[revision,setRevision]=useState(0);
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[saving,setSaving]=useState(false);
  const [draft,setDraft]=useState<Record<string,string|boolean>|null>(null);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');
    const query=new URLSearchParams({search,status,limit:'25',offset:String(offset)});
    apiFetch('/api/admin/'+kind+'?'+query,{headers:{Authorization:'Bearer '+token},signal:controller.signal})
      .then(async r=>{const result=await r.json();if(!r.ok)throw new Error(result.error||'Không tải được danh mục.');if(!controller.signal.aborted){setRows(result.data);setTotal(result.total);}})
      .catch(err=>{if(!controller.signal.aborted)setError(err.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[kind,token,search,status,offset,revision]);
  const edit=(row?:CatalogEntry)=>{setError('');setDraft(row?{...row}:{code:'',name:'',isActive:true,...Object.fromEntries(config.fields.map(([field])=>[field,'']))});};
  const save=async(event:React.FormEvent)=>{
    event.preventDefault();if(!draft)return;setSaving(true);setError('');
    try{
      const response=await apiFetch('/api/admin/'+kind+(draft.id?'/'+draft.id:''),{method:draft.id?'PUT':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(draft)});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'Không thể lưu.');setDraft(null);setRevision(v=>v+1);
    }catch(err){setError(err instanceof Error?err.message:'Không thể kết nối.');}finally{setSaving(false);}
  };
  return <div className="integration-page catalog-page">
    <div className="dashboard-heading"><div><div className="eyebrow"><span/>DANH MỤC NGHIỆP VỤ</div><h1>{config.title}</h1><p>Quản lý dữ liệu dùng chung khi lập hồ sơ tập huấn và cấp chứng nhận.</p></div><div className="integration-heading-actions"><button className="dashboard-refresh" aria-label="Làm mới danh mục" disabled={loading} onClick={()=>setRevision(v=>v+1)}><RefreshCw size={16}/></button>{canEdit&&<button className="primary-button" onClick={()=>edit()}><Plus size={17}/>Thêm {config.singular}</button>}</div></div>
    {!canEdit&&<p className="catalog-info">Bạn có quyền xem danh mục. SUPERADMIN quản lý nội dung và trạng thái hoạt động.</p>}
    {error&&<div className="lookup-alert" role="alert">{error}</div>}
    {draft&&<section className="dashboard-panel integration-create"><div className="dashboard-panel-heading"><h2>{draft.id?'Chỉnh sửa':'Thêm'} {config.singular}</h2><button className="icon-button" aria-label="Đóng biểu mẫu" disabled={saving} onClick={()=>setDraft(null)}><X size={18}/></button></div><form className="integration-form" onSubmit={save}>
      {[['code','Mã danh mục'],['name','Tên '+config.singular],...config.fields].map(([field,label])=><div key={field} className={'form-field '+(field==='description'?'catalog-wide':'')}><label htmlFor={'catalog-'+field}>{label}{field==='code'||field==='name'?' *':''}</label>{field==='description'?<textarea id={'catalog-'+field} rows={4} maxLength={4000} value={String(draft[field]||'')} onChange={e=>setDraft({...draft,[field]:e.target.value})}/>:<input id={'catalog-'+field} required={field==='code'||field==='name'} type={field==='email'?'email':field==='durationHours'?'number':'text'} min={field==='durationHours'?1:undefined} max={field==='durationHours'?1000:undefined} maxLength={field==='name'?250:field==='address'?500:field==='code'?64:160} value={String(draft[field]||'')} onChange={e=>setDraft({...draft,[field]:e.target.value})}/>}</div>)}
      <div className="form-field"><label htmlFor="catalog-status">Trạng thái</label><select id="catalog-status" value={draft.isActive?'ACTIVE':'DISABLED'} onChange={e=>setDraft({...draft,isActive:e.target.value==='ACTIVE'})}><option value="ACTIVE">Đang hoạt động</option><option value="DISABLED">Ngừng sử dụng</option></select></div><div className="integration-create-action"><button className="primary-button" disabled={saving}>{saving?<LoaderCircle className="animate-spin" size={16}/>:<Icon size={17}/>}Lưu {config.singular}</button></div>
      <p className="catalog-wide catalog-info">Ngừng sử dụng sẽ ẩn khỏi gợi ý trong hồ sơ mới. Nội dung trên chứng nhận đã lưu được giữ nguyên.</p>
    </form></section>}
    <section className="dashboard-panel"><div className="catalog-filters"><div className="form-field"><label htmlFor="catalog-search">Tìm theo mã hoặc tên</label><div className="catalog-search"><Search size={17}/><input id="catalog-search" type="search" value={search} onChange={e=>{setSearch(e.target.value);setOffset(0);}} placeholder="Nhập mã hoặc tên…"/></div></div><div className="form-field"><label htmlFor="catalog-filter">Trạng thái</label><select id="catalog-filter" value={status} onChange={e=>{setStatus(e.target.value);setOffset(0);}}><option value="ALL">Tất cả trạng thái</option><option value="ACTIVE">Đang hoạt động</option><option value="DISABLED">Ngừng sử dụng</option></select></div><span className="dashboard-count-pill">{total} {config.singular}</span></div>
      <div className="integration-table-scroll"><table className="integration-table"><thead><tr><th>Mã / Tên {config.singular}</th><th>{kind==='training-programs'?'Nội dung / Thời lượng':'Mã số thuế / Giấy phép'}</th><th>{kind==='training-programs'?'Cập nhật':'Liên hệ / Địa chỉ'}</th><th>Trạng thái</th>{canEdit&&<th>Thao tác</th>}</tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><strong>{row.name}</strong><small>{row.code}</small></td><td>{kind==='training-programs'?<><span className="catalog-description">{row.description||'Chưa có mô tả'}</span><small>{row.durationHours?row.durationHours+' giờ':'Chưa đặt thời lượng'}</small></>:<>{row.taxCode||'Chưa có mã số thuế'}<small>{row.businessLicense||'Chưa có giấy phép'}</small></>}</td><td>{kind==='training-programs'?new Date(row.updatedAt).toLocaleString('vi-VN'): <>{row.contactPerson||'—'}<small>{[row.phone,row.email].filter(Boolean).join(' · ')||'Chưa có liên hệ'}</small><small>{row.address}</small></>}</td><td><span className={'dashboard-status state-'+(row.isActive?'issued':'revoked')}>{row.isActive?'Đang hoạt động':'Ngừng sử dụng'}</span></td>{canEdit&&<td><button className="icon-button" aria-label={'Chỉnh sửa '+row.name} onClick={()=>edit(row)}><Pencil size={17}/></button></td>}</tr>)}</tbody></table>{!rows.length&&<div className="dashboard-empty"><Icon size={30}/><h3>{loading?'Đang tải…':'Chưa có dữ liệu phù hợp'}</h3><p>{canEdit?'Thêm mới hoặc điều chỉnh bộ lọc để bắt đầu quản lý.':'Điều chỉnh bộ lọc hoặc liên hệ quản trị viên.'}</p></div>}</div>
      <div className="catalog-pagination"><button className="dashboard-refresh" disabled={!offset||loading} onClick={()=>setOffset(v=>Math.max(0,v-25))}>Trước</button><span>Trang {Math.floor(offset/25)+1} / {Math.max(1,Math.ceil(total/25))}</span><button className="dashboard-refresh" disabled={offset+25>=total||loading} onClick={()=>setOffset(v=>v+25)}>Sau</button></div>
    </section>
  </div>;
};
