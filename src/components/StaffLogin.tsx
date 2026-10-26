import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, BadgeCheck, LockKeyhole, UserRound, Eye, EyeOff, AlertCircle, LoaderCircle, Building2 } from 'lucide-react';
import { AdminUser } from '../types';
import { apiFetch } from '../utils/api';

interface Props {onLoginSuccess:(user:AdminUser,token:string)=>void;onBack:()=>void;}
export const StaffLogin:React.FC<Props> = ({onLoginSuccess,onBack}) => {
  const [username,setUsername]=useState(''),[password,setPassword]=useState('');
  const [showPassword,setShowPassword]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();setLoading(true);setError('');
    try {
      const response=await apiFetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:username.trim(),password})});
      const data=await response.json();
      if(!response.ok || !data.success) setError(data.error || 'Đăng nhập chưa thành công.');
      else {localStorage.setItem('driver_admin_token',data.token);localStorage.setItem('driver_admin_user',JSON.stringify(data.user));localStorage.setItem('driver_admin_login_time',String(Date.now()));onLoginSuccess(data.user,data.token);}
    } catch {setError('Chưa thể kết nối đến máy chủ. Vui lòng thử lại.');}
    finally {setLoading(false);}
  };
  return <section className="staff-login">
    <aside className="login-story"><div className="eyebrow light"><span/>KHÔNG GIAN NGHIỆP VỤ</div><h1>Mỗi hồ sơ chuẩn xác.<br/><em>Một hành trình vững tin.</em></h1><p>Không gian làm việc dành cho cán bộ quản lý, cơ sở đào tạo và lực lượng kiểm tra.</p><div className="login-story-art" aria-hidden="true"><div className="login-seal"><BadgeCheck size={64} strokeWidth={1}/></div><div className="login-art-label"><span/><span/><span/></div></div><div className="login-agency"><Building2 size={20}/><span>Sở Xây dựng TP. Hồ Chí Minh<small>Trung tâm Quản lý Giao thông công cộng</small></span></div></aside>
    <div className="login-form-side"><button className="back-link" onClick={onBack}><ArrowLeft size={16}/>Về trang tra cứu</button><div className="login-form-content"><span className="form-heading-icon"><LockKeyhole size={23}/></span><h2>Chào mừng trở lại</h2><p>Đăng nhập tài khoản cán bộ để tiếp tục công việc.</p><form onSubmit={submit} className="lookup-form" aria-busy={loading}><div className="form-field"><label htmlFor="staff-username">Tên đăng nhập</label><div className="input-with-icon"><UserRound size={18}/><input id="staff-username" autoComplete="username" required value={username} onChange={e=>setUsername(e.target.value)} placeholder="Nhập tên đăng nhập"/></div></div><div className="form-field"><label htmlFor="staff-password">Mật khẩu</label><div className="input-with-icon password-input"><LockKeyhole size={18}/><input id="staff-password" type={showPassword?'text':'password'} autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Nhập mật khẩu"/><button type="button" onClick={()=>setShowPassword(!showPassword)} aria-label={showPassword?'Ẩn mật khẩu':'Hiện mật khẩu'}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></div>{error&&<div className="lookup-alert" role="alert"><AlertCircle size={18}/>{error}</div>}<button className="primary-button search-submit" disabled={loading}>{loading?<LoaderCircle className="animate-spin" size={18}/>:<LockKeyhole size={17}/>}<span>{loading?'Đang xác thực…':'Đăng nhập hệ thống'}</span><ArrowRight size={18}/></button></form><p className="login-help">Cần hỗ trợ tài khoản? Vui lòng liên hệ cán bộ quản trị tại đơn vị của bạn.</p></div><div className="login-form-footer"><BadgeCheck size={15}/>Cổng quản lý tập huấn nghiệp vụ lái xe</div></div>
  </section>;
};
