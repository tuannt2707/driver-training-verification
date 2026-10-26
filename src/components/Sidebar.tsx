import React, { useEffect, useRef } from 'react';
import { Search, Building2, FileBadge, Settings2, X, ArrowUpRight, ShieldCheck, ScanLine, ChevronRight, LayoutDashboard, KeyRound, BookOpen, Truck } from 'lucide-react';
import { RouteName } from '../utils/router';
import { AdminUser } from '../types';
interface SidebarProps {
  currentRoute: RouteName; onNavigate: (path: string) => void; currentUser: AdminUser | null;
  currentToken: string; isOpen: boolean; onClose: () => void;
  activeCertStatus?: string; onSelectCertStatus?: (status: string) => void;
  activeSchoolStatus?: 'ALL' | 'ACTIVE' | 'DISABLED'; onSelectSchoolStatus?: (status: 'ALL' | 'ACTIVE' | 'DISABLED') => void;
}
export const Sidebar: React.FC<SidebarProps> = ({currentRoute,onNavigate,currentUser,currentToken,isOpen,onClose,activeCertStatus='ALL',onSelectCertStatus,activeSchoolStatus='ALL',onSelectSchoolStatus}) => {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!isOpen || window.innerWidth >= 1024) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const buttons = (): HTMLButtonElement[] => Array.from(panel.current?.querySelectorAll('button:not([disabled])') || []) as HTMLButtonElement[];
    buttons()[0]?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const controls = buttons(), first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown',keyboard);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown',keyboard); previous?.focus(); };
  }, [isOpen,onClose]);
  const navigate = (path: string) => { onNavigate(path); if(window.innerWidth<1024) onClose(); };
  const items = [
    {name:'dashboard',label:'Tổng quan',path:'/dashboard',icon:LayoutDashboard},
    {name:'lookup',label:'Tra cứu chứng nhận',path:'/lookup',icon:Search},
    {name:'certificates',label:'Học viên & chứng nhận',path:'/certificates',icon:FileBadge},
    {name:'schools',label:'Cơ sở đào tạo',path:'/schools',icon:Building2},
    {name:'trainingPrograms',label:'Chương trình tập huấn',path:'/training-programs',icon:BookOpen},
    {name:'transportUnits',label:'Đơn vị kinh doanh vận tải',path:'/transport-units',icon:Truck},
  ];
  return <>
    {isOpen && <button className="sidebar-backdrop lg:hidden" aria-label="Đóng điều hướng" onClick={onClose}/>}
    <aside ref={panel} className={'app-sidebar no-print '+(isOpen?'is-open':'')} aria-label="Điều hướng chính" inert={!isOpen}>
      <div className="sidebar-brand"><img src="/logoTT.png" alt="Logo Trung tâm"/><div><small>SỞ XÂY DỰNG TP.HCM</small><strong>Tập huấn lái xe<span>Cổng quản lý & xác thực</span></strong></div><button className="sidebar-close lg:hidden" onClick={onClose} aria-label="Đóng điều hướng"><X size={18}/></button></div>
      <div className="sidebar-scroll">
        <p className="nav-section-label">NGHIỆP VỤ</p>
        <nav className="sidebar-nav">
          {items.map(({name,label,path,icon:Icon})=><React.Fragment key={name}>
            <button className={'nav-item '+(currentRoute===name || (name==='lookup' && currentRoute==='verify')?'is-active':'')} aria-current={currentRoute===name ? 'page':undefined} onClick={()=>navigate(path)}><Icon size={19}/><span>{label}</span><ChevronRight size={14}/></button>
            {name==='certificates' && currentRoute==='certificates' && <div className="nav-subitems">{[['ALL','Tất cả hồ sơ'],['ISSUED','Đã cấp chứng nhận'],['PENDING','Chờ cấp chứng nhận'],['EXPIRED','Hết hiệu lực'],['REVOKED','Đã thu hồi']].map(([value,text])=><button key={value} className={activeCertStatus===value?'is-selected':''} onClick={()=>{onSelectCertStatus?.(value);if(window.innerWidth<1024)onClose();}}><span/>{text}</button>)}</div>}
            {name==='schools' && currentRoute==='schools' && <div className="nav-subitems">{(['ALL','ACTIVE','DISABLED'] as const).map((value,i)=><button key={value} className={activeSchoolStatus===value?'is-selected':''} onClick={()=>{onSelectSchoolStatus?.(value);if(window.innerWidth<1024)onClose();}}><span/>{['Tất cả cơ sở','Đang hoạt động','Tạm ngưng hoạt động'][i]}</button>)}</div>}
          </React.Fragment>)}
          {currentToken && <button className={'nav-item '+(currentRoute==='verify'?'is-active':'')} onClick={()=>navigate('/verify-certificate/'+currentToken)}><ScanLine size={19}/><span>Chứng nhận đang xem</span></button>}
        </nav>
        <p className="nav-section-label mt-8">HỆ THỐNG</p>
        <nav className="sidebar-nav"><button className={'nav-item '+(currentRoute==='admin'?'is-active':'')} onClick={()=>navigate('/admin')}><Settings2 size={19}/><span>{currentUser?.role==='SUPERADMIN'?'Quản trị hệ thống':'Tài khoản của tôi'}</span></button></nav>
        {currentUser?.role==='SUPERADMIN' && <nav className="sidebar-nav mt-2"><button className={'nav-item '+(currentRoute==='apiKeys'?'is-active':'')} onClick={()=>navigate('/admin/api-keys')}><KeyRound size={19}/><span>API tích hợp</span></button></nav>}
        <div className="sidebar-note"><span className="sidebar-note-icon"><ShieldCheck size={21}/></span><strong>Quản lý tập trung.<br/>Xác thực minh bạch.</strong><p>Kết nối cơ sở đào tạo và hồ sơ chứng nhận trên cùng một hệ thống.</p><button onClick={()=>navigate('/lookup')}>Mở cổng tra cứu <ArrowUpRight size={15}/></button></div>
      </div>
      <div className="sidebar-footer"><span className="status-dot"/><span>Trung tâm QLGT công cộng</span><small>TP.HCM</small></div>
    </aside>
  </>;
};
