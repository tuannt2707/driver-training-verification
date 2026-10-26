import React from 'react';
import { MapPin, ArrowUpRight, LockKeyhole } from 'lucide-react';
import { AdminUser } from '../types';
interface FooterProps {onNavigate?: (path:string)=>void; currentUser?:AdminUser|null;}
export const Footer: React.FC<FooterProps> = ({onNavigate,currentUser}) => <footer className="app-footer no-print">
  <div className="footer-inner"><div><strong>Trung tâm Quản lý Giao thông công cộng TP.HCM</strong><p><MapPin size={13}/>27 Phạm Viết Chánh, Phường Cầu Ông Lãnh, TP. Hồ Chí Minh</p></div><div className="footer-end"><span>© 2026 · Sở Xây dựng TP.HCM</span>{!currentUser && onNavigate && <button onClick={()=>onNavigate('/login')}><LockKeyhole size={13}/>Dành cho cán bộ<ArrowUpRight size={13}/></button>}</div></div>
</footer>;
