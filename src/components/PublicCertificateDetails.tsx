import React from 'react';
import {Award,Building2,User,GraduationCap,ShieldCheck} from 'lucide-react';
import {PublicCertificateView} from '../types';

const populated=(value:unknown)=>value!==null&&value!==undefined&&String(value).trim()!=='';
type Row={label:string;value?:string;className?:string};

/** Shared public presentation. Identity masking remains controlled by the API DTO. */
export const PublicCertificateDetails:React.FC<{cert:PublicCertificateView}>=({cert})=>{
  const trainingPeriod=[cert.trainingStartDate,cert.trainingEndDate].filter(populated).join(' đến ');
  const decision=[cert.decisionNumber,cert.decisionDate].filter(populated).join(' · ');
  const sections:{title:string;icon:typeof Award;rows:Row[]}[]=[
    {title:'Lớp & Cơ sở đào tạo',icon:Building2,rows:[
      {label:'Mã Lớp học',value:cert.courseCode},
      {label:'Cơ sở / Trường đào tạo',value:cert.schoolName},
      {label:'Chương trình tập huấn',value:cert.courseName},
      {label:'Đơn vị phối hợp tổ chức',value:cert.coorganizingUnit},
      {label:'Đơn vị kinh doanh vận tải',value:cert.transportUnit},
    ]},
    {title:'Thông tin học viên / người lái xe',icon:User,rows:[
      {label:'Họ và tên',value:cert.fullName},
      {label:'Giấy CCCD / CMND số',value:cert.cccd},
      {label:'Ngày, tháng, năm sinh',value:cert.dateOfBirthMasked},
      {label:'Số Giấy phép lái xe (GPLX)',value:cert.licenseNumber},
      {label:'Địa chỉ thường trú',value:cert.addressMasked},
    ]},
    {title:'Kết quả đào tạo & kiểm tra',icon:GraduationCap,rows:[
      {label:'Điều kiện kiểm tra',value:cert.examEligibility},
      {label:'Điểm kiểm tra',value:cert.examScore},
      {label:'Kết quả kiểm tra',value:cert.examResult,className:cert.examResult==='Không đạt'?'text-red-700':'text-emerald-800'},
      {label:'Thời gian tập huấn',value:trainingPeriod},
      {label:'Ngày kiểm tra',value:cert.examDate},
    ]},
    {title:'Giấy Chứng Nhận Tập Huấn Nghiệp Vụ',icon:Award,rows:[
      {label:'Số Giấy chứng nhận',value:cert.certificateNumber,className:'text-emerald-900 font-mono'},
      {label:'Số và ngày Quyết định cấp',value:decision},
      {label:'Có giá trị hiệu lực đến',value:cert.validUntil,className:cert.isExpired?'text-red-700':'text-emerald-800'},
      {label:'Dấu kiểm định điện tử',value:cert.schoolName?`Xác thực bởi ${cert.schoolName}`:''},
    ]},
  ];
  return <article className="public-certificate-details space-y-4">
    <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-800 via-teal-800 to-emerald-900 text-white shadow-lg p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row items-start gap-4">
        {cert.avatarUrl&&<img src={cert.avatarUrl} alt={cert.fullName} className="w-20 h-20 rounded-2xl object-cover border border-white/30 shrink-0"/>}
        <div className="min-w-0 flex-1">
          {cert.schoolName&&<p className="text-xs font-semibold text-emerald-100">{cert.schoolCode?`[${cert.schoolCode}] `:''}{cert.schoolName}</p>}
          {cert.fullName&&<h2 className="text-2xl sm:text-3xl font-bold text-white mt-1">{cert.fullName}</h2>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-emerald-100 mt-2">
            {populated(cert.cccd)&&<span>Số CCCD: <strong className="text-white">{cert.cccd}</strong></span>}
            {populated(cert.dateOfBirthMasked)&&<span>Sinh ngày: <strong className="text-white">{cert.dateOfBirthMasked}</strong></span>}
            {populated(cert.licenseNumber)&&<span>Số GPLX: <strong className="text-white">{cert.licenseNumber}</strong></span>}
          </div>
        </div>
        {cert.statusLabel&&<span className={'public-certificate-status '+(cert.isRevoked?'is-revoked':cert.isExpired?'is-expired':cert.isIssued?'is-issued':'is-pending')}><ShieldCheck size={16}/>{cert.statusLabel}</span>}
      </div>
    </section>
    {sections.map(({title,icon:Icon,rows},index)=>{
      const visible=rows.filter(row=>populated(row.value));if(!visible.length)return null;
      return <section key={title} className="bg-white rounded-2xl p-4 sm:p-5 border border-emerald-100/90 shadow-xs">
        <h3 className="flex items-center gap-2 text-xs sm:text-sm font-bold uppercase tracking-wider text-emerald-800 mb-3 pb-2.5 border-b border-emerald-100"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-white text-xs">{index+1}</span><Icon className="w-4 h-4 shrink-0"/>{title}</h3>
        <dl className="divide-y divide-slate-100 text-xs sm:text-sm">{visible.map(row=><div key={row.label} className="flex flex-col sm:flex-row sm:items-start py-2.5 gap-1 sm:gap-4"><dt className="text-slate-500 font-medium sm:w-56 shrink-0">{row.label}:</dt><dd className={'font-semibold break-words min-w-0 '+(row.className||'text-slate-900')}>{row.value}</dd></div>)}</dl>
      </section>;
    })}
  </article>;
};
