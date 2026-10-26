import React,{useEffect,useState,useId,useRef} from 'react';
import {apiFetch} from '../utils/api';

export const CatalogNameInput:React.FC<{
  kind:'training-programs'|'transport-units';token:string;value:string;selectedId?:string;onChange:(id:string,name:string)=>void;
  required?:boolean;placeholder?:string;className?:string;
}>=({kind,token,value,selectedId,onChange,required,className})=>{
  const [options,setOptions]=useState<{id:string;code:string;name:string}[]>([]),[error,setError]=useState(false),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
  const [search,setSearch]=useState(''),[open,setOpen]=useState(false),[active,setActive]=useState(0);
  const listId=useId(),input=useRef<HTMLInputElement>(null);
  useEffect(()=>{input.current?.setCustomValidity(required&&!value?'Vui lòng chọn một chương trình trong danh mục.':'');},[required,value]);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError(false);
    (async()=>{
      const all:typeof options=[];
      for(let offset=0;;offset+=200){
        const r=await apiFetch('/api/admin/'+kind+'?status=ACTIVE&limit=200&offset='+offset,{headers:{Authorization:'Bearer '+token},signal:controller.signal});
        if(!r.ok)throw new Error('Catalog unavailable');const result=await r.json();all.push(...result.data);
        if(all.length>=result.total||!result.data.length)break;
      }
      if(!controller.signal.aborted)setOptions(all);
    })().catch(()=>{if(!controller.signal.aborted){setOptions([]);setError(true);}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[kind,token,revision]);
  const label=kind==='training-programs'?'Chương trình tập huấn':'Đơn vị kinh doanh vận tải';
  const normalize=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().replace(/\s+/g,' ').trim();
  const query=normalize(search);
  const filtered=options.filter(option=>normalize(option.code+' '+option.name).includes(query));
  const selected=options.find(option=>option.id===selectedId);
  const display=selected?`[${selected.code}] ${selected.name}`:value||'';
  const close=()=>{setOpen(false);setSearch('');setActive(0);};
  const choose=(option:typeof options[number])=>{onChange(option.id,option.name);close();};
  return <><div className="catalog-combobox" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))close();}}>
    <input ref={input} role="combobox" aria-label={label} aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={open&&filtered[active]?`${listId}-${active}`:undefined} autoComplete="off" required={required&&!value} value={open?search:display} title={display} placeholder={open&&display?display:loading?'Đang tải danh mục…':'Gõ mã hoặc tên để chọn…'} className={className}
      onFocus={()=>{setOpen(true);setSearch('');setActive(0);}}
      onClick={()=>{if(!open){setOpen(true);setSearch('');setActive(0);}}}
      onChange={event=>{setSearch(event.target.value);setActive(0);setOpen(true);}}
      onKeyDown={event=>{
        if(event.nativeEvent.isComposing)return;
        if(event.key==='Escape'){event.preventDefault();close();}
        if(event.key==='ArrowDown'||event.key==='ArrowUp'){
          event.preventDefault();setOpen(true);
          const next=!open?0:Math.max(0,Math.min(filtered.length-1,active+(event.key==='ArrowDown'?1:-1)));
          setActive(next);document.getElementById(`${listId}-${next}`)?.scrollIntoView({block:'nearest'});
        }
        if(event.key==='Enter'){event.preventDefault();if(open&&filtered[active])choose(filtered[active]);}
      }}/>
    <span className="catalog-combobox-chevron" aria-hidden="true">⌄</span>
    {value&&<button type="button" className="catalog-combobox-clear" aria-label={'Bỏ chọn '+label.toLowerCase()} onMouseDown={e=>e.preventDefault()} onClick={()=>{onChange('','');setSearch('');setActive(0);input.current?.focus();}}>×</button>}
    {open&&<div className="catalog-combobox-menu" id={listId} role="listbox" aria-label={'Danh sách '+label.toLowerCase()}>
      {filtered.map((option,index)=><div key={option.id} id={`${listId}-${index}`} role="option" aria-selected={selectedId===option.id} className={'catalog-combobox-option '+(index===active?'is-highlighted':'')} onMouseDown={event=>event.preventDefault()} onMouseEnter={()=>setActive(index)} onClick={()=>choose(option)}><strong>[{option.code}]</strong> {option.name}{selectedId===option.id&&<span aria-hidden="true"> ✓</span>}</div>)}
      {!filtered.length&&<p className="catalog-combobox-empty">{loading?'Đang tải danh mục…':error?'Không tải được danh mục.':'Không có kết quả phù hợp.'}</p>}
    </div>}
  </div><small className="catalog-input-note" aria-live="polite">{error?'Không tải được danh mục. Vui lòng thử lại.':loading?'Đang tải danh mục…':open?`${filtered.length} kết quả. Gõ để lọc, chọn bằng chuột hoặc phím ↑ ↓ và Enter.`:'Gõ trực tiếp để tìm theo mã hoặc tên, hỗ trợ không dấu.'}</small>{error&&<button type="button" className="dashboard-text-link" onClick={()=>setRevision(v=>v+1)}>Tải lại danh mục</button>}</>;
};