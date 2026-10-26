import { PublicCertificateDetails } from './PublicCertificateDetails';
import React, { useState } from 'react';
import { Search, ArrowRight, ArrowUpRight, CreditCard, BadgeCheck, UserRound, CalendarDays, ScanLine, LockKeyhole, CircleCheck, AlertCircle, LoaderCircle, FileBadge, Route } from 'lucide-react';
import { apiFetch } from '../utils/api';
import { PublicCertificateView } from '../types';

interface Props { onSelectCertificate: (token: string) => void; }
export const PublicLookup: React.FC<Props> = () => {
  const [mode,setMode] = useState<'cccd'|'license'>('cccd');
  const [identifier,setIdentifier] = useState('');
  const [fullName,setFullName] = useState('');
  const [dateOfBirth,setDateOfBirth] = useState('');
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState('');
  const [results,setResults] = useState<PublicCertificateView[]|null>(null);
  const search = async (event:React.FormEvent) => {
    event.preventDefault(); setError('');setResults(null);setLoading(true);
    try {
      const response = await apiFetch('/api/public/lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lookupType:mode,[mode==='cccd'?'cccd':'licenseNumber']:identifier.trim(),fullName:fullName.trim(),dateOfBirth})});
      const data = await response.json();
      if(!response.ok || !data.success) setError(data.error || 'Chưa thể tra cứu. Vui lòng thử lại.');
      else {setResults(data.data || []);if(!data.data?.length)setError('Không tìm thấy hồ sơ phù hợp. Vui lòng kiểm tra lại số giấy tờ, họ tên và ngày sinh.');}
    } catch {setError('Chưa thể kết nối máy chủ. Vui lòng thử lại sau.');}
    finally {setLoading(false);}
  };
  return <div className="lookup-page">
    <section className="lookup-hero">
      <div className="lookup-intro">
        <div className="eyebrow"><span/>CỔNG TRA CỨU & XÁC THỰC</div>
        <h1>Chứng nhận rõ ràng.<br/><em>Hành trình an tâm.</em></h1>
        <p className="hero-description">Tra cứu thông tin tập huấn nghiệp vụ lái xe kinh doanh vận tải. Đối chiếu hồ sơ nhanh chóng, thuận tiện và bảo vệ thông tin cá nhân.</p>
        <div className="hero-trust"><span><BadgeCheck size={17}/>Đối chiếu thông tin</span><span><LockKeyhole size={16}/>Bảo vệ dữ liệu cá nhân</span></div>
        <div className="certificate-illustration" aria-hidden="true">
          <div className="illustration-orbit orbit-one"/><div className="illustration-orbit orbit-two"/>
          <div className="certificate-preview">
            <div className="preview-top"><span className="preview-symbol"><FileBadge size={24}/></span><span>TẬP HUẤN NGHIỆP VỤ<br/><strong>LÁI XE KINH DOANH VẬN TẢI</strong></span><BadgeCheck size={23}/></div>
            <div className="preview-heading">Giấy chứng nhận</div>
            <div className="preview-lines"><span/><span/><span/></div>
            <div className="preview-bottom"><span><CircleCheck size={14}/>Tra cứu & đối chiếu</span><ScanLine size={40}/></div>
          </div>
          <div className="floating-check"><span><BadgeCheck size={22}/></span><div><strong>Thông tin trong tầm tay</strong><small>Quét QR trên giấy chứng nhận</small></div><ArrowUpRight size={17}/></div>
          <div className="illustration-caption"><Route size={15}/><span>Đồng hành cùng mỗi hành trình</span></div>
        </div>
      </div>
      <div className="lookup-form-card">
        <div className="form-card-heading"><span className="form-heading-icon"><Search size={22}/></span><span className="step-label">TRA CỨU HỒ SƠ</span></div>
        <h2>Tìm chứng nhận của bạn</h2><p>Nhập thông tin trùng khớp với hồ sơ đã đăng ký tại cơ sở đào tạo.</p>
        <div className="lookup-switch" aria-label="Chọn giấy tờ tra cứu">
          <button type="button" aria-pressed={mode==='cccd'} className={mode==='cccd'?'is-selected':''} onClick={()=>{setMode('cccd');setIdentifier('');setError('');setResults(null);}}><CreditCard size={17}/>Số CCCD</button>
          <button type="button" aria-pressed={mode==='license'} className={mode==='license'?'is-selected':''} onClick={()=>{setMode('license');setIdentifier('');setError('');setResults(null);}}><FileBadge size={17}/>Giấy phép lái xe</button>
        </div>
        <form onSubmit={search} className="lookup-form" aria-busy={loading}>
          <div className="form-field"><label htmlFor="lookup-id">{mode==='cccd'?'Số căn cước công dân':'Số giấy phép lái xe'} <span>*</span></label><div className="input-with-icon"><CreditCard size={18}/><input id="lookup-id" inputMode="numeric" autoComplete="off" pattern="[0-9]{12}" maxLength={12} required value={identifier} onChange={e=>setIdentifier(e.target.value.replace(/\D/g,''))} placeholder="Nhập 12 chữ số" aria-describedby="identifier-hint"/></div><small id="identifier-hint">Nhập đầy đủ 12 chữ số, bao gồm số 0 ở đầu.</small></div>
          <div className="form-field"><label htmlFor="lookup-name">Họ và tên đầy đủ <span>*</span></label><div className="input-with-icon"><UserRound size={18}/><input id="lookup-name" autoComplete="name" required value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Nhập họ và tên học viên"/></div></div>
          <div className="form-field"><label htmlFor="lookup-dob">Ngày sinh <span>*</span></label><div className="input-with-icon"><CalendarDays size={18}/><input id="lookup-dob" type="date" autoComplete="bday" required value={dateOfBirth} onChange={e=>setDateOfBirth(e.target.value)}/></div></div>
          {error && <div className="lookup-alert" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
          <button className="primary-button search-submit" disabled={loading} type="submit">{loading?<LoaderCircle className="animate-spin" size={18}/>:<Search size={18}/>}<span>{loading?'Đang tra cứu…':'Tra cứu chứng nhận'}</span>{!loading&&<ArrowRight size={18}/>}</button>
          <p className="form-privacy"><LockKeyhole size={14}/>Thông tin định danh được che khi trả kết quả.</p>
        </form>
      </div>
    </section>
    {results && results.length>0 && <section className="lookup-results" aria-live="polite"><div className="results-heading"><div><span className="eyebrow">KẾT QUẢ ĐỐI CHIẾU</span><h2>Tìm thấy {results.length} chứng nhận</h2></div><span className="result-count"><CircleCheck size={16}/>Thông tin trùng khớp</span></div><div className="lookup-certificate-list">{results.map(cert=><PublicCertificateDetails key={cert.certificateNumber} cert={cert}/>)}</div></section>}
    <section className="lookup-guide" aria-label="Hướng dẫn tra cứu"><div className="guide-intro"><span className="eyebrow">ĐƠN GIẢN & THUẬN TIỆN</span><h2>Ba bước để đối chiếu hồ sơ</h2></div><div className="guide-steps">{[
      {n:'01',title:'Chọn giấy tờ',text:'Sử dụng số CCCD hoặc số giấy phép lái xe đã đăng ký.',icon:CreditCard},
      {n:'02',title:'Nhập thông tin',text:'Điền đầy đủ họ tên và ngày sinh của học viên.',icon:UserRound},
      {n:'03',title:'Đối chiếu kết quả',text:'Kiểm tra thông tin và trạng thái giấy chứng nhận.',icon:BadgeCheck},
    ].map(({n,title,text,icon:Icon})=><article key={n}><div className="guide-step-top"><span className="guide-icon"><Icon size={20}/></span><span className="guide-number">{n}</span></div><h3>{title}</h3><p>{text}</p></article>)}</div></section>
  </div>;
};
