import React from 'react';
import { Menu, LogOut, ChevronRight, ShieldCheck } from 'lucide-react';
import { AdminUser } from '../types';
import { RouteName } from '../utils/router';

interface HeaderProps {
  currentRoute: RouteName; onNavigate: (path: string) => void; currentUser: AdminUser | null;
  onLogout: () => void; currentToken: string; isSidebarOpen?: boolean;
  onToggleSidebar: () => void; showSidebarToggle?: boolean;
}
const titles: Record<RouteName, string> = {
  trainingPrograms:'Chương trình tập huấn',transportUnits:'Đơn vị kinh doanh vận tải',
  apiKeys: 'API tích hợp',
  dashboard: 'Tổng quan',
  lookup: 'Tra cứu chứng nhận', verify: 'Xác thực chứng nhận', certificates: 'Học viên & chứng nhận',
  schools: 'Cơ sở đào tạo', admin: 'Quản trị hệ thống', login: 'Cổng cán bộ',
};
export const Header: React.FC<HeaderProps> = ({currentRoute, onNavigate, currentUser, onLogout, onToggleSidebar, showSidebarToggle = Boolean(currentUser), isSidebarOpen}) => (
  <header className="app-header no-print">
    <div className="header-inner">
      <div className="flex items-center gap-3 min-w-0">
        {showSidebarToggle ? <>
          <button className="icon-button" onClick={onToggleSidebar} aria-label="Ẩn hoặc hiện danh mục" aria-expanded={isSidebarOpen}><Menu size={20}/></button>
          <div className="workspace-breadcrumb"><span>Không gian làm việc</span><ChevronRight size={14}/><strong>{titles[currentRoute]}</strong></div>
        </> : <button onClick={()=>onNavigate('/lookup')} className="brand-lockup" aria-label="Về trang tra cứu">
          <span className="brand-logo"><img src="/logoTT.png" alt="Trung tâm Quản lý Giao thông công cộng"/></span>
          <span className="brand-copy"><span>SỞ XÂY DỰNG TP. HỒ CHÍ MINH</span><strong>Cổng thông tin tập huấn lái xe</strong></span>
        </button>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {currentUser ? <>
          <div className="header-user"><span className="user-avatar">{currentUser.fullName.trim().split(/\s+/).pop()?.charAt(0)}</span><span><strong>{currentUser.fullName}</strong><small>{currentUser.role === 'SUPERADMIN' ? 'Quản trị viên hệ thống' : currentUser.role === 'INSPECTOR' ? 'Thanh tra viên' : currentUser.schoolName || 'Quản trị cơ sở'}</small></span></div>
          <button onClick={onLogout} className="icon-button" aria-label="Đăng xuất" title="Đăng xuất"><LogOut size={18}/></button>
        </> : <span className="header-service"><span className="status-dot"/><span>Xác thực điện tử</span><ShieldCheck size={16}/></span>}
      </div>
    </div>
  </header>
);
