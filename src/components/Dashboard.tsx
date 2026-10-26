import React, { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, FileBadge, BadgeCheck, Clock3, CalendarClock, RefreshCw, Building2, Search, Settings2, AlertCircle, Inbox, LoaderCircle } from 'lucide-react';
import { AdminUser, DashboardStats } from '../types';
import { apiFetch } from '../utils/api';

interface Props {
  currentUser: AdminUser;
  token: string;
  onNavigate: (path: string) => void;
  onViewCertificates: (status: string) => void;
}

const number = (value: number) => value.toLocaleString('vi-VN');
const monthLabel = (month: string) => 'T' + Number(month.slice(5)) + '/' + month.slice(2,4);
const states = [
  {key:'ISSUED',field:'issuedCount',label:'Còn hiệu lực',color:'#327c59'},
  {key:'PENDING',field:'pendingCount',label:'Chờ cấp',color:'#bdab6e'},
  {key:'EXPIRED',field:'expiredCount',label:'Hết hiệu lực',color:'#93a38c'},
  {key:'REVOKED',field:'revokedCount',label:'Đã thu hồi',color:'#be8270'},
] as const;

export const Dashboard: React.FC<Props> = ({currentUser,token,onNavigate,onViewCertificates}) => {
  const [stats,setStats] = useState<DashboardStats | null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [revision,setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    const load = async () => {
      try {
        const response = await apiFetch('/api/admin/stats',{headers:{Authorization:'Bearer '+token},signal:controller.signal});
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'Chưa thể tải dữ liệu tổng quan.');
        if (!Array.isArray(result.data?.createdByMonth) || typeof result.data?.generatedAt !== 'string' || typeof result.data?.expiringSoonCount !== 'number') {
          throw new Error('Máy chủ đang chạy phiên bản cũ. Vui lòng khởi động lại server để sử dụng dashboard.');
        }
        if (!controller.signal.aborted) setStats(result.data);
      } catch (err) {
        if (!controller.signal.aborted) {setStats(null);setError(err instanceof Error ? err.message : 'Chưa thể kết nối máy chủ.');}
      } finally {if (!controller.signal.aborted) setLoading(false);}
    };
    void load();
    return () => controller.abort();
  }, [token,revision]);

  const distribution = states.map(state=>({...state,count:stats?.[state.field] || 0}));
  let end = 0;
  const gradient = distribution.map(item=>{
    const start = end;
    end += stats?.totalDrivers ? item.count / stats.totalDrivers * 360 : 0;
    return `${item.color} ${start}deg ${end}deg`;
  }).join(',');
  const maxMonthly = Math.max(1,...(stats?.createdByMonth.map(item=>item.count) || []));
  const monthlyTotal = stats?.createdByMonth.reduce((sum,item)=>sum+item.count,0) || 0;
  const metrics = stats ? [
    {title:'Tổng hồ sơ',value:stats.totalDrivers,description:'Hồ sơ chứng nhận trong phạm vi',icon:FileBadge,status:'ALL',tone:'green'},
    {title:'Còn hiệu lực',value:stats.issuedCount,description:'Chứng nhận đang có hiệu lực',icon:BadgeCheck,status:'ISSUED',tone:'green'},
    {title:'Chờ cấp chứng nhận',value:stats.pendingCount,description:'Hồ sơ đang ở trạng thái chờ',icon:Clock3,status:'PENDING',tone:'gold'},
    {title:'Hết hiệu lực',value:stats.expiredCount,description:'Chứng nhận cần được rà soát',icon:CalendarClock,status:'EXPIRED',tone:'muted'},
  ] : [];

  return <div className="dashboard-page" aria-busy={loading}>
    <div className="dashboard-heading">
      <div><div className="eyebrow"><span/>KHÔNG GIAN LÀM VIỆC</div><h1>Tổng quan {currentUser.role==='SCHOOL_ADMIN'?'đơn vị':'hệ thống'}</h1><p>Theo dõi hồ sơ tập huấn và tình trạng chứng nhận của đơn vị.</p></div>
      <button className="dashboard-refresh" disabled={loading} onClick={()=>setRevision(value=>value+1)}><RefreshCw size={15} className={loading?'animate-spin':''}/>{loading?'Đang cập nhật':'Làm mới dữ liệu'}</button>
    </div>

    <section className="dashboard-welcome">
      <div><span className="dashboard-welcome-label">CHÀO MỪNG TRỞ LẠI</span><h2>{currentUser.fullName}</h2><p>{currentUser.role==='SCHOOL_ADMIN' ? currentUser.schoolName : currentUser.role==='INSPECTOR' ? 'Không gian đối chiếu và kiểm tra chứng nhận toàn hệ thống.' : 'Quản lý tập trung. Theo dõi rõ ràng. Chủ động mỗi ngày.'}</p></div>
      <div className="dashboard-scope"><Building2 size={21}/><span><strong>{currentUser.role==='SCHOOL_ADMIN'?'Phạm vi cơ sở của bạn':'Phạm vi toàn hệ thống'}</strong><small>{stats ? number(stats.schoolCount)+' cơ sở trong phạm vi' : 'Đang tải số liệu'}</small></span></div>
    </section>

    {error && <div className="dashboard-error" role="alert"><AlertCircle size={20}/><div><strong>Chưa thể tải dashboard</strong><p>{error}</p></div><button onClick={()=>setRevision(value=>value+1)}>Thử lại <RefreshCw size={14}/></button></div>}
    {loading && !stats && <div className="dashboard-metrics" aria-label="Đang tải số liệu">{[0,1,2,3].map(value=><div key={value} className="dashboard-skeleton"><span/><strong/><span/></div>)}</div>}

    {stats && <>
      <section className="dashboard-metrics" aria-label="Chỉ số tổng quan">{metrics.map(({title,value,description,icon:Icon,status,tone})=><button key={title} className={'dashboard-metric metric-'+tone} onClick={()=>onViewCertificates(status)}><div className="metric-label"><span>{title}</span><Icon size={18}/></div><strong>{number(value)}</strong><div className="metric-bottom"><span>{description}</span><ArrowUpRight size={15}/></div></button>)}</section>

      <div className="dashboard-charts">
        <section className="dashboard-panel monthly-panel"><div className="dashboard-panel-heading"><div><span className="eyebrow">HOẠT ĐỘNG HỒ SƠ</span><h2>Hồ sơ tạo mới</h2><p>6 tháng gần nhất · tính theo ngày tạo, giờ Việt Nam</p></div><span className="dashboard-count-pill">{number(monthlyTotal)} hồ sơ</span></div>
          <div className="monthly-chart" role="img" aria-label={'Hồ sơ tạo mới: '+stats.createdByMonth.map(item=>monthLabel(item.month)+': '+item.count).join(', ')}>{stats.createdByMonth.map((item,index)=><div className="monthly-column" key={item.month}><div className="monthly-track"><span className="monthly-value">{number(item.count)}</span><div className={'monthly-bar '+(index===5?'is-current':'')} style={{height:item.count ? Math.max(5,item.count/maxMonthly*100)+'%' : '3px'}}/></div><span className="monthly-label">{monthLabel(item.month)}</span></div>)}</div>
          {monthlyTotal===0 && <p className="dashboard-chart-note">Chưa có hồ sơ được tạo trong giai đoạn này.</p>}
        </section>
        <section className="dashboard-panel distribution-panel"><div className="dashboard-panel-heading"><div><span className="eyebrow">TRẠNG THÁI HIỆN TẠI</span><h2>Phân bố chứng nhận</h2></div></div>
          <div className="distribution-content"><div className="distribution-ring" role="img" aria-label={distribution.map(item=>item.label+': '+item.count).join(', ')} style={{background:stats.totalDrivers ? `conic-gradient(${gradient})` : '#edf1e9'}}><div><strong>{number(stats.totalDrivers)}</strong><span>Tổng hồ sơ</span></div></div><div className="distribution-legend">{distribution.map(item=><button key={item.key} onClick={()=>onViewCertificates(item.key)}><span className="legend-dot" style={{background:item.color}}/><span>{item.label}</span><strong>{number(item.count)}</strong><small>{stats.totalDrivers?Math.round(item.count/stats.totalDrivers*100):0}%</small></button>)}</div></div>
          <p className="dashboard-chart-note">Trạng thái hiệu lực được đối chiếu theo ngày hiện tại.</p>
        </section>
      </div>

      <div className="dashboard-bottom-grid">
        <section className="dashboard-panel dashboard-recent"><div className="dashboard-panel-heading"><div><span className="eyebrow">CẬP NHẬT HỒ SƠ</span><h2>Hồ sơ tạo gần đây</h2></div><button className="dashboard-text-link" onClick={()=>onViewCertificates('ALL')}>Xem tất cả <ArrowRight size={15}/></button></div>
          {stats.recentCertificates.length ? <div className="dashboard-table-scroll"><table><thead><tr><th>Học viên / Chứng nhận</th><th>Cơ sở đào tạo</th><th>Trạng thái</th></tr></thead><tbody>{stats.recentCertificates.map(cert=><tr key={cert.certificateNumber}><td><div className="recent-person"><span className="recent-avatar">{cert.fullName.trim().split(/\s+/).pop()?.charAt(0)}</span><div><strong>{cert.fullName}</strong><small>{cert.certificateNumber}</small></div></div></td><td><span className="recent-school">{cert.schoolName}</span><small>{cert.issueDate}</small></td><td><span className={'dashboard-status state-'+cert.status.toLowerCase()}>{states.find(state=>state.key===cert.status)?.label || cert.statusLabel}</span></td></tr>)}</tbody></table></div> : <div className="dashboard-empty"><Inbox size={29}/><h3>Chưa có hồ sơ chứng nhận</h3><p>Hồ sơ mới sẽ xuất hiện tại đây sau khi được tạo.</p><button className="dashboard-text-link" onClick={()=>onViewCertificates('ALL')}>Mở danh sách hồ sơ <ArrowRight size={15}/></button></div>}
        </section>
        <aside className="dashboard-side-stack"><section className="dashboard-attention"><span className="attention-icon"><CalendarClock size={23}/></span><span className="eyebrow">CẦN THEO DÕI</span><h2>{number(stats.expiringSoonCount)} <span>chứng nhận</span></h2><p>Còn hiệu lực và sẽ hết hạn từ hôm nay đến 30 ngày tới.</p><button onClick={()=>onViewCertificates('ISSUED')}>Xem các GCN còn hiệu lực <ArrowRight size={16}/></button></section>
          <section className="dashboard-panel dashboard-shortcuts"><h2>Truy cập nhanh</h2><button onClick={()=>onViewCertificates('ALL')}><FileBadge size={17}/><span>{currentUser.role==='INSPECTOR'?'Danh sách chứng nhận':'Quản lý hồ sơ'}</span><ArrowUpRight size={14}/></button><button onClick={()=>onNavigate('/lookup')}><Search size={17}/><span>Tra cứu thông tin</span><ArrowUpRight size={14}/></button><button onClick={()=>onNavigate('/schools')}><Building2 size={17}/><span>Cơ sở đào tạo</span><ArrowUpRight size={14}/></button><button onClick={()=>onNavigate('/admin')}><Settings2 size={17}/><span>{currentUser.role==='SUPERADMIN'?'Quản trị hệ thống':'Tài khoản của tôi'}</span><ArrowUpRight size={14}/></button></section>
        </aside>
      </div>
      <div className="dashboard-updated" aria-live="polite">{loading?<><LoaderCircle size={13} className="animate-spin"/>Đang cập nhật…</>:<><span className="status-dot"/>Dữ liệu cập nhật lúc {new Date(stats.generatedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})} · Phạm vi theo tài khoản đăng nhập</>}</div>
    </>}
  </div>;
};
