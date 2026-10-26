import { apiFetch } from '../utils/api';
import { defaultCertificateExpiry, todayVN, normalizeCertificateDates, CERTIFICATE_DATE_FIELDS, isoDate } from '../../server/rules';
import { CatalogNameInput } from './CatalogNameInput';
import { normalizeExcelRow } from '../utils/excel';
import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  GraduationCap,
  Award,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Search,
  Plus,
  Upload,
  Download,
  Filter,
  Trash2,
  Edit,
  Eye,
  ShieldCheck,
  FileSpreadsheet,
  RefreshCw,
  Lock,
  Building2,
  Phone,
  CreditCard,
  MapPin,
  X,
  History,
  Copy,
  Sparkles,
  ExternalLink,
  LogIn,
  AlertCircle,
  FileDown,
  Info,
  FileText,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RotateCcw
} from 'lucide-react';
import {
  DriverCertificate,
  AdminUser,
  DashboardStats,
  CertificateStatus
} from '../types';

export const PRESET_SCHOOLS = [
  { name: 'Trường Trung cấp Giao thông Vận tải Miền Nam', code: 'TCGTVT-MN' },
  { name: 'Trường Cao đẳng Giao thông Vận tải Trung ương III', code: 'CDGTVT-TW3' },
  { name: 'Trung tâm Đào tạo và Sát hạch Lái xe ĐH An ninh Nhân dân', code: 'TTSH-ANND' },
  { name: 'Trung tâm GDNN Đào tạo & Sát hạch Lái xe Tiến Bộ', code: 'TT-TIENBO' },
  { name: 'Trung tâm Đào tạo Lái xe Thống Nhất', code: 'TT-THONGNHAT' }
];

export const formatAddressDisplay = (addr: any): string => {
  if (!addr) return '';
  if (typeof addr === 'string') {
    try {
      const parsed = JSON.parse(addr);
      if (typeof parsed === 'object' && parsed !== null) {
        return formatAddressDisplay(parsed);
      }
    } catch {
      return addr.trim();
    }
    return addr.trim();
  }
  if (typeof addr === 'object' && addr !== null) {
    const street = (addr.streetAddress || '').trim();
    const ward = (addr.ward || '').trim();
    const district = (addr.district || '').trim();
    const province = (addr.province || '').trim();

    if (street && (street.includes(province) || (district && street.includes(district)))) {
      return street;
    }

    const parts: string[] = [];
    if (street) parts.push(street);
    if (ward && !street.includes(ward)) parts.push(ward);
    if (district && !street.includes(district)) parts.push(district);
    if (province && !street.includes(province)) parts.push(province);
    return parts.filter(Boolean).join(', ') || street || province || '';
  }
  return String(addr);
};

interface Props {
  currentUser: AdminUser | null;
  token: string;
  onViewCertificate: (qrToken: string) => void;
  onNavigateLogin: () => void;
  initialStatusFilter?: string;
  onStatusFilterChange?: (status: string) => void;
}

export const CertificateManagement: React.FC<Props> = ({
  currentUser,
  token,
  onViewCertificate,
  onNavigateLogin,
  initialStatusFilter = 'ALL',
  onStatusFilterChange
}) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [certificates, setCertificates] = useState<DriverCertificate[]>([]);
  const [availableSchools, setAvailableSchools] = useState(PRESET_SCHOOLS);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter);
  const [schoolFilter, setSchoolFilter] = useState<string>('ALL');

  // Pagination & Display Limit (10, 20, 50)
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalRecords, setTotalRecords] = useState<number>(0);

  // Extended Date Filter
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);
  const [dateType, setDateType] = useState<'issueDate' | 'validUntil' | 'examDate' | 'decisionDate'>('issueDate');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  useEffect(() => {
    if (initialStatusFilter && initialStatusFilter !== statusFilter) {
      setStatusFilter(initialStatusFilter);
      setCurrentPage(1);
    }
  }, [initialStatusFilter]);

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCert, setEditingCert] = useState<Partial<DriverCertificate> | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any | null>(null);
  const [exporting, setExporting] = useState(false);
  const [downloadingSample, setDownloadingSample] = useState(false);

  // Validation States for Excel Import
  const [validationErrors, setValidationErrors] = useState<{
    row: number;
    fullName: string;
    cccd: string;
    license: string;
    dob: string;
    phone?: string;
    reasons: string[];
  }[]>([]);
  const [validRowCount, setValidRowCount] = useState<number>(0);
  const [selectedFileName, setSelectedFileName] = useState<string>('');

  // Status Change Modal
  const [statusModalCert, setStatusModalCert] = useState<DriverCertificate | null>(null);
  const [newStatus, setNewStatus] = useState<CertificateStatus>('ISSUED');
  const [revokeReason, setRevokeReason] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load available schools from DB
  useEffect(() => {
    apiFetch('/api/public/schools')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data) && data.data.length > 0) {
          setAvailableSchools(
            data.data
              .filter((s: any) => s.isActive !== false && s.status !== 'DISABLED')
              .map((s: any) => ({ name: s.name, code: s.code }))
          );
        }
      })
      .catch(() => {});
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Stats
      if (token) {
        const statsRes = await apiFetch('/api/admin/stats', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          if (statsData.success) setStats(statsData.data);
        }
      }

      // 2. Fetch Certificates
      const queryParams = new URLSearchParams();
      if (searchTerm) queryParams.append('search', searchTerm);
      if (statusFilter !== 'ALL') queryParams.append('status', statusFilter);
      if (schoolFilter !== 'ALL') queryParams.append('schoolCode', schoolFilter);
      if (startDate) queryParams.append('startDate', startDate);
      if (endDate) queryParams.append('endDate', endDate);
      if (dateType) queryParams.append('dateType', dateType);
      queryParams.append('limit', String(pageSize));
      queryParams.append('offset', String((currentPage - 1) * pageSize));

      const headers: any = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await apiFetch(`/api/admin/certificates?${queryParams.toString()}`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setCertificates(data.items || []);
          setTotalRecords(data.total !== undefined ? data.total : (data.items || []).length);
        }
      } else {
        // Fallback for public viewing: lookup public sample or empty
        const fallbackRes = await apiFetch('/api/public/schools');
        const fallbackData = await fallbackRes.json();
        if (fallbackData.success) {
          // Can still render empty or list
        }
      }
    } catch (err: any) {
      console.error('Failed to load certificates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [searchTerm, statusFilter, schoolFilter, startDate, endDate, dateType, pageSize, currentPage, token]);

  const handleCopyLink = (qrToken: string) => {
    const fullUrl = `${window.location.origin}/verify-certificate/${qrToken}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedToken(qrToken);
    setTimeout(() => setCopiedToken(null), 2500);
  };

  const handleOpenCreateModal = () => {
    if (currentUser?.role === 'INSPECTOR') {
      alert('Thanh tra viên chỉ có quyền xem và tra cứu hồ sơ.');
      return;
    }

    let defaultSchool = availableSchools[0] || PRESET_SCHOOLS[0];
    if (currentUser?.role === 'SCHOOL_ADMIN' && currentUser.schoolCode) {
      const matched = availableSchools.find((s) => s.code === currentUser.schoolCode);
      defaultSchool = matched || { name: currentUser.schoolName || '', code: currentUser.schoolCode };
    }

    const now = new Date();
    const issueDateStr = todayVN();
    const validUntilStr = defaultCertificateExpiry(issueDateStr);

    const year = now.getFullYear();

    setEditingCert({
      certificateNumber: '',
      decisionNumber: '',
      decisionDate: issueDateStr,
      fullName: '',
      dateOfBirth: '',
      cccdNumber: '',
      cccdIssueDate: '',
      phoneNumber: '',
      address: {
        province: 'TP. Hồ Chí Minh',
        district: '',
        ward: '',
        streetAddress: ''
      },
      avatarUrl: '',
      licenseNumber: '',
      licenseClass: 'Hạng B2',
      licenseIssueDate: '',
      schoolName: defaultSchool.name,
      schoolCode: defaultSchool.code,
      courseCode: `TH-${year}-B2-K01`,
      courseName: '',
      trainingProgramId: '',
      transportUnitId: '',
      coorganizingUnit: 'Sở Xây dựng TP. Hồ Chí Minh',
      transportUnit: '',
      examEligibility: 'Đủ điều kiện kiểm tra',
      examScore: '',
      examResult: 'Không đạt',
      trainingStartDate: issueDateStr,
      trainingEndDate: issueDateStr,
      examDate: issueDateStr,
      status: 'PENDING',
      issueDate: issueDateStr,
      validUntil: validUntilStr,
      signatoryName: '',
      signatoryTitle: 'Giám đốc Trung tâm / Hiệu trưởng',
      notes: ''
    });
    setIsEditModalOpen(true);
  };

  const handleOpenEditModal = (cert: DriverCertificate) => {
    setEditingCert(normalizeCertificateDates(cert));
    const invalidDates=CERTIFICATE_DATE_FIELDS.filter(field=>cert[field]&&!isoDate(cert[field]));
    setError(invalidDates.length?'Hồ sơ có ngày không hợp lệ: '+invalidDates.join(', ')+'. Vui lòng kiểm tra và sửa trước khi lưu.':null);
    setIsEditModalOpen(true);
  };

  const handleSaveCert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCert) return;

    if (!editingCert.fullName?.trim() || !editingCert.cccdNumber?.trim() || !editingCert.licenseNumber?.trim()) {
      setError('Vui lòng nhập đầy đủ: Họ tên, Số CCCD và Số GPLX.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const isNew = !editingCert.id;
      const url = isNew ? '/api/admin/certificates' : `/api/admin/certificates/${editingCert.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await apiFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(editingCert.id ? editingCert : { ...editingCert, status: undefined })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Lỗi lưu thông tin học viên.');
      } else {
        setIsEditModalOpen(false);
        setEditingCert(null);
        await fetchData();
      }
    } catch (err: any) {
      setError('Lỗi kết nối máy chủ.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCert = async (id: string, name: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa hồ sơ học viên "${name}" khỏi cơ sở dữ liệu?`)) {
      return;
    }

    try {
      const res = await apiFetch(`/api/admin/certificates/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await fetchData();
      } else {
        alert(data.error || 'Không thể xóa hồ sơ.');
      }
    } catch (err: any) {
      alert('Lỗi kết nối.');
    }
  };

  const handleUpdateStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusModalCert) return;

    setSaving(true);
    try {
      const res = await apiFetch(`/api/admin/certificates/${statusModalCert.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          status: newStatus,
          revokedReason: newStatus === 'REVOKED' ? revokeReason : undefined
        })
      });

      if (res.ok) {
        setStatusModalCert(null);
        await fetchData();
      } else {
        alert('Cập nhật trạng thái thất bại.');
      }
    } catch (err: any) {
      alert('Lỗi kết nối.');
    } finally {
      setSaving(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      setExporting(true);
      const headers: any = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await apiFetch(`/api/admin/certificates/export-excel`, {
        headers
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Xuất file Excel thất bại. Vui lòng kiểm tra quyền đăng nhập.');
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Danh_Sach_Hoc_Vien_Tap_Huan_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Không thể kết nối đến máy chủ để tải file Excel.');
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadSampleExcel = async () => {
    try {
      setDownloadingSample(true);
      const headers: any = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await apiFetch(`/api/admin/certificates/sample-excel`, {
        headers
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Không thể tải file mẫu Excel.');
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Mau_Danh_Sach_Hoc_Vien_Tap_Huan_TEXT_FORMAT.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Lỗi kết nối khi tải file mẫu.');
    } finally {
      setDownloadingSample(false);
    }
  };

  const validateBirthDateLocal = (dateStr: string): boolean => {
    if (!dateStr) return false;
    const s = String(dateStr).trim();
    const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (dmy) {
      const day = parseInt(dmy[1], 10);
      const month = parseInt(dmy[2], 10);
      const year = parseInt(dmy[3], 10);
      if (month < 1 || month > 12) return false;
      if (day < 1 || day > 31) return false;
      if (year < 1900 || year > new Date().getFullYear() - 18) return false;
      const d = new Date(year, month - 1, day);
      return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
    }
    const ymd = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
    if (ymd) {
      const year = parseInt(ymd[1], 10);
      const month = parseInt(ymd[2], 10);
      const day = parseInt(ymd[3], 10);
      if (month < 1 || month > 12) return false;
      if (day < 1 || day > 31) return false;
      if (year < 1900 || year > new Date().getFullYear() - 18) return false;
      const d = new Date(year, month - 1, day);
      return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
    }
    return false;
  };

  const validateRowsData = (data: any[]) => {
    const errors: {
      row: number;
      fullName: string;
      cccd: string;
      license: string;
      dob: string;
      phone?: string;
      reasons: string[];
    }[] = [];
    let validCount = 0;

    data.forEach((r, idx) => {
      const rowNum = idx + 1;
      const reasons: string[] = [];

      const fullName = String(r['Họ và tên'] || r['Họ tên'] || r['FullName'] || r['fullName'] || '').trim();
      const rawCccd = String(r['Số CCCD'] || r['CCCD'] || r['Số CMND'] || r['cccdNumber'] || '').trim();
      const rawLicense = String(r['Số GPLX'] || r['GPLX'] || r['licenseNumber'] || '').trim();
      const rawDob = String(r['Ngày sinh'] || r['Năm sinh'] || r['dateOfBirth'] || '').trim();
      const rawPhone = String(r['Số điện thoại'] || r['SĐT'] || r['phoneNumber'] || '').trim();

      // 1. Kiểm tra Họ và tên
      if (!fullName) {
        reasons.push("Thiếu Họ và tên học viên");
      }

      // 2. Kiểm tra Số CCCD (Bắt buộc 12 số)
      let cleanCccd = rawCccd.replace(/\s+/g, '');
      if (/^\d{11}$/.test(cleanCccd)) {
        cleanCccd = '0' + cleanCccd; // Bù số 0 đầu nếu Excel cắt mất
      }
      if (!/^\d{12}$/.test(cleanCccd)) {
        reasons.push(`Số CCCD '${rawCccd || 'trống'}' không hợp lệ (Bắt buộc phải gồm đúng 12 chữ số)`);
      }

      // 3. Kiểm tra Số GPLX (Bắt buộc 12 số theo phôi PET)
      let cleanLicense = rawLicense.replace(/\s+/g, '');
      if (/^\d{11}$/.test(cleanLicense)) {
        cleanLicense = '0' + cleanLicense;
      }
      if (!/^\d{12}$/.test(cleanLicense)) {
        reasons.push(`Số GPLX '${rawLicense || 'trống'}' không hợp lệ (Bắt buộc phải gồm đúng 12 chữ số theo phôi PET)`);
      }

      // 4. Kiểm tra Định dạng Ngày sinh
      if (!rawDob) {
        reasons.push("Thiếu Ngày sinh");
      } else if (!validateBirthDateLocal(rawDob)) {
        reasons.push(`Ngày sinh '${rawDob}' không đúng định dạng (Ví dụ: 14/08/1987 hoặc 1987-08-14) hoặc năm sinh không trong độ tuổi lái xe (từ 18 tuổi)`);
      }

      // 5. Kiểm tra Số điện thoại (nếu có)
      let cleanPhone = rawPhone.replace(/\s+/g, '');
      if (/^[35789]\d{8}$/.test(cleanPhone)) {
        cleanPhone = '0' + cleanPhone;
      }
      if (cleanPhone && !/^0\d{9}$/.test(cleanPhone)) {
        reasons.push(`Số điện thoại '${rawPhone}' không hợp lệ (Phải gồm 10 chữ số bắt đầu bằng 0)`);
      }

      if (reasons.length > 0) {
        errors.push({
          row: rowNum,
          fullName: fullName || '(Chưa nhập tên)',
          cccd: rawCccd,
          license: rawLicense,
          dob: rawDob,
          phone: rawPhone,
          reasons
        });
      } else {
        validCount++;
      }
    });

    setValidationErrors(errors);
    setValidRowCount(validCount);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        // Read maintaining cell formatting as text strings
        const wb = XLSX.read(bstr, { type: 'binary', cellText: true, raw: false });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        // Parse sheet to json with raw: false to ensure all values are string formatted
        const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: false, defval: '' }).map(normalizeExcelRow);
        setImportRows(data);
        setImportResult(null);
        validateRowsData(data);
      } catch (err) {
        alert('Tệp Excel không hợp lệ hoặc bị lỗi định dạng.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleExportErrorReportText = () => {
    if (validationErrors.length === 0) return;

    const lines: string[] = [];
    lines.push('================================================================================');
    lines.push('       BÁO CÁO LỖI KIỂM TRA DỮ LIỆU FILE EXCEL HỌC VIÊN TẬP HUẤN LÁI XE');
    lines.push('       Cơ quan: SỞ XÂY DỰNG TP. HỒ CHÍ MINH · TRUNG TÂM QUẢN LÝ GTCC');
    lines.push(`       Tệp Excel kiểm tra: ${selectedFileName || 'Danh_sach_hoc_vien.xlsx'}`);
    lines.push(`       Thời gian xuất báo cáo: ${new Date().toLocaleString('vi-VN')}`);
    lines.push(`       Tổng số dòng kiểm tra: ${importRows.length}`);
    lines.push(`       Số dòng hợp lệ (Đạt): ${validRowCount}`);
    lines.push(`       Số dòng phát hiện lỗi: ${validationErrors.length}`);
    lines.push('================================================================================\n');

    validationErrors.forEach((err, idx) => {
      lines.push(`[MỤC ${idx + 1}] - LỖI TẠI DÒNG ${err.row} TRONG FILE EXCEL:`);
      lines.push(`  • Họ và tên học viên: ${err.fullName}`);
      lines.push(`  • Số CCCD ghi trong file: '${err.cccd || '(Bị trống)'}'`);
      lines.push(`  • Số GPLX ghi trong file: '${err.license || '(Bị trống)'}'`);
      lines.push(`  • Ngày sinh ghi trong file: '${err.dob || '(Bị trống)'}'`);
      if (err.phone) lines.push(`  • Số điện thoại ghi trong file: '${err.phone}'`);
      lines.push('  * CÁC NGUYÊN NHÂN LỖI CẦN KHẮC PHỤC:');
      err.reasons.forEach((r, rIdx) => {
        lines.push(`    ${rIdx + 1}. ${r}`);
      });
      lines.push('--------------------------------------------------------------------------------');
    });

    lines.push('\n================================================================================');
    lines.push('QUY CHUẨN ĐỊNH DẠNG ĐỂ KHẮC PHỤC LỖI TRƯỚC KHI TẢI LẠI:');
    lines.push('1. Trong Excel, chọn toàn bộ cột dữ liệu và định dạng là TEXT (Ký hiệu @) trước khi lưu.');
    lines.push('2. SỐ CCCD: Bắt buộc đúng 12 chữ số (ví dụ: 079087019284), không để Excel làm mất số 0 đầu.');
    lines.push('3. SỐ GPLX: Bắt buộc đúng 12 chữ số theo phôi PET chuẩn hiện hành.');
    lines.push('4. NGÀY SINH: Điền theo định dạng DD/MM/YYYY (ví dụ: 14/08/1987) hoặc YYYY-MM-DD (1987-08-14).');
    lines.push('5. SỐ ĐIỆN THOẠI: Nếu có nhập, phải là 10 chữ số bắt đầu bằng số 0 (ví dụ: 0903819283).');
    lines.push('================================================================================');

    const textContent = lines.join('\r\n');
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Bao_Cao_Loi_Kiem_Tra_Excel_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportSubmit = async (importValidOnly = false) => {
    if (importRows.length === 0) return;
    setImporting(true);
    setImportResult(null);

    try {
      const res = await apiFetch('/api/admin/certificates/import-excel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          rows: importRows,
          importValidOnly
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setImportResult(data);
        await fetchData();
      } else {
        setImportResult(data);
        if (data.importedCount > 0) await fetchData();
        if (data.errorDetails && Array.isArray(data.errorDetails)) {
          setValidationErrors(data.errorDetails);
        }
        alert(data.error || data.errors?.join('\n') || 'Nhập dữ liệu thất bại.');
      }
    } catch (err: any) {
      alert('Lỗi kết nối khi import Excel.');
    } finally {
      setImporting(false);
    }
  };

  const getStatusBadge = (status: CertificateStatus) => {
    switch (status) {
      case 'ISSUED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Đã cấp GCN</span>
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>Chờ xử lý</span>
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
            <AlertTriangle className="w-3.5 h-3.5 text-slate-500" />
            <span>Hết hiệu lực</span>
          </span>
        );
      case 'REVOKED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-100 text-red-800 border border-red-300">
            <XCircle className="w-3.5 h-3.5 text-red-600" />
            <span>Đã thu hồi</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="module-page space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl border border-emerald-100 shadow-xs">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold mb-2">
            <GraduationCap className="w-3.5 h-3.5 text-emerald-600" />
            <span>Hệ thống Tập huấn nghiệp vụ lái xe kinh doanh vận tải</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Quản Lý Hồ Sơ Học Viên & Giấy Chứng Nhận
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Tổng hợp dữ liệu học viên, cấp mới chứng chỉ, tra soát mã Token và xuất nhập báo cáo Excel.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center flex-wrap gap-2">
          {currentUser ? (
            <>
              {currentUser.role !== 'INSPECTOR' && (
                <>
                  <button
                    type="button"
                    onClick={handleOpenCreateModal}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Cấp mới GCN</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setImportRows([]);
                      setImportResult(null);
                      setIsImportModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs sm:text-sm font-semibold transition-colors"
                  >
                    <Upload className="w-4 h-4 text-emerald-700" />
                    <span>Nhập Excel</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={handleExportExcel}
                disabled={exporting}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs sm:text-sm font-semibold transition-colors disabled:opacity-60"
              >
                <Download className={`w-4 h-4 text-emerald-700 ${exporting ? 'animate-bounce' : ''}`} />
                <span>{exporting ? 'Đang xuất...' : 'Xuất Excel'}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onNavigateLogin}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-colors"
            >
              <LogIn className="w-4 h-4" />
              <span>Đăng Nhập Cán Bộ Quản Trị</span>
            </button>
          )}

          <button
            type="button"
            onClick={fetchData}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors"
            title="Tải lại danh sách"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-700' : ''}`} />
          </button>
        </div>
      </div>

      {/* Public Mode Notice if not logged in */}
      {!currentUser && (
        <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs sm:text-sm">
          <div className="flex items-center gap-2.5 text-emerald-900">
            <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0" />
            <span>
              Bạn đang xem dữ liệu ở chế độ công bố. Cán bộ quản lý của Sở Xây dựng và các Cơ sở đào tạo vui lòng{' '}
              <strong className="font-bold underline cursor-pointer" onClick={onNavigateLogin}>
                Đăng nhập
              </strong>{' '}
              để cấp mới, chỉnh sửa, thu hồi và quản lý hồ sơ.
            </span>
          </div>
          <button
            type="button"
            onClick={onNavigateLogin}
            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg text-xs shrink-0"
          >
            Đăng nhập ngay
          </button>
        </div>
      )}

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-xs">
            <div className="text-[11px] font-bold text-slate-500 uppercase">Tổng Học Viên</div>
            <div className="text-2xl font-black text-slate-900 mt-1">{stats.totalDrivers}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Toàn hệ thống</div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-xs">
            <div className="text-[11px] font-bold text-emerald-700 uppercase">Đã Cấp GCN</div>
            <div className="text-2xl font-black text-emerald-700 mt-1">{stats.issuedCount}</div>
            <div className="text-[10px] text-emerald-600 mt-0.5">Có hiệu lực hợp pháp</div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-xs">
            <div className="text-[11px] font-bold text-amber-700 uppercase">Chờ Xử Lý</div>
            <div className="text-2xl font-black text-amber-700 mt-1">{stats.pendingCount}</div>
            <div className="text-[10px] text-amber-600 mt-0.5">Đang học / kiểm tra</div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-xs">
            <div className="text-[11px] font-bold text-slate-600 uppercase">Hết Hiệu Lực</div>
            <div className="text-2xl font-black text-slate-700 mt-1">{stats.expiredCount}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Quá ngày hết hạn chứng nhận</div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-xs">
            <div className="text-[11px] font-bold text-red-700 uppercase">Bị Thu Hồi</div>
            <div className="text-2xl font-black text-red-700 mt-1">{stats.revokedCount}</div>
            <div className="text-[10px] text-red-600 mt-0.5">Vi phạm quy chế</div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Main search and selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
            {/* Search box */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Tìm Tên, CCCD, GPLX, Mã GCN..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              />
            </div>

            {/* School filter */}
            <div>
              <select
                value={schoolFilter}
                onChange={(e) => {
                  setSchoolFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              >
                <option value="ALL">-- Tất cả cơ sở đào tạo --</option>
                {availableSchools.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Status filter */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              >
                <option value="ALL">-- Tất cả trạng thái --</option>
                <option value="ISSUED">Đã cấp Giấy chứng nhận</option>
                <option value="PENDING">Đang chờ xử lý</option>
                <option value="EXPIRED">Hết hiệu lực</option>
                <option value="REVOKED">Bị thu hồi</option>
              </select>
            </div>
          </div>

          {/* Right Action: Icon Bộ Lọc Mở Rộng & Page Size Quick Buttons */}
          <div className="flex items-center gap-2 shrink-0 justify-between sm:justify-end">
            {/* Expandable Date Filter Toggle Button */}
            <button
              type="button"
              onClick={() => setShowAdvancedFilter(!showAdvancedFilter)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold border transition-all cursor-pointer ${
                showAdvancedFilter || startDate || endDate
                  ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
              }`}
              title="Bộ lọc ngày mở rộng"
            >
              <Filter className={`w-4 h-4 ${showAdvancedFilter || startDate || endDate ? 'text-white' : 'text-emerald-700'}`} />
              <span>Lọc Ngày Mở Rộng</span>
              {(startDate || endDate) && (
                <span className="w-2 h-2 rounded-full bg-amber-300 animate-pulse"></span>
              )}
            </button>

            {/* Select 10, 20, 50 rows per page */}
            <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200 text-xs">
              <span className="text-slate-500 px-1 hidden sm:inline">Hiện:</span>
              {[10, 20, 50].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => {
                    setPageSize(size);
                    setCurrentPage(1);
                  }}
                  className={`px-2 py-1 rounded-lg font-bold text-xs transition-colors cursor-pointer ${
                    pageSize === size
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                  }`}
                  title={`Hiển thị ${size} dòng mỗi trang`}
                >
                  {size}
                </button>
              ))}
              <span className="text-slate-500 text-[11px] pr-1">dòng</span>
            </div>
          </div>
        </div>

        {/* EXTENDED DATE FILTER PANEL (BỘ LỌC NGÀY MỞ RỘNG) */}
        {showAdvancedFilter && (
          <div className="p-4 bg-emerald-50/70 rounded-2xl border border-emerald-200 space-y-3 transition-all animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-emerald-200/80 pb-2.5">
              <div className="flex items-center gap-1.5 font-bold text-emerald-950 text-xs uppercase tracking-wide">
                <Calendar className="w-4 h-4 text-emerald-700" />
                <span>Bộ Lọc Theo Khoảng Thời Gian / Ngày Tháng</span>
              </div>
              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                    setCurrentPage(1);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 hover:text-red-700 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Xóa bộ lọc ngày</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1 uppercase text-[10px]">
                  Loại Ngày Cần Lọc
                </label>
                <select
                  value={dateType}
                  onChange={(e) => {
                    setDateType(e.target.value as any);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden font-medium text-slate-800"
                >
                  <option value="issueDate">Ngày cấp Giấy chứng nhận</option>
                  <option value="examDate">Ngày kiểm tra</option>
                  <option value="validUntil">Ngày hết hạn (Có giá trị đến)</option>
                  <option value="decisionDate">Ngày Quyết định cấp</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1 uppercase text-[10px]">
                  Từ Ngày (Bắt đầu)
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden font-medium text-slate-800"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1 uppercase text-[10px]">
                  Đến Ngày (Kết thúc)
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden font-medium text-slate-800"
                />
              </div>

              {/* Quick Preset Buttons */}
              <div>
                <label className="block text-slate-700 font-bold mb-1 uppercase text-[10px]">
                  Chọn Nhanh Khoảng Thời Gian
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date().toISOString().split('T')[0];
                      setStartDate(today);
                      setEndDate(today);
                      setCurrentPage(1);
                    }}
                    className="px-2 py-1.5 bg-white hover:bg-emerald-100/70 border border-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                  >
                    Hôm nay
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const past = new Date();
                      past.setDate(now.getDate() - 30);
                      setStartDate(past.toISOString().split('T')[0]);
                      setEndDate(now.toISOString().split('T')[0]);
                      setCurrentPage(1);
                    }}
                    className="px-2 py-1.5 bg-white hover:bg-emerald-100/70 border border-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                  >
                    30 ngày qua
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const year = new Date().getFullYear();
                      setStartDate(`${year}-01-01`);
                      setEndDate(`${year}-12-31`);
                      setCurrentPage(1);
                    }}
                    className="px-2 py-1.5 bg-white hover:bg-emerald-100/70 border border-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                  >
                    Năm nay ({new Date().getFullYear()})
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Certificates Table */}
      <div className="bg-white rounded-2xl border border-emerald-100 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-3 text-center w-12 font-extrabold text-slate-600">STT</th>
                <th className="py-3 px-4">Số Hiệu GCN</th>
                <th className="py-3 px-4">Học Viên</th>
                <th className="py-3 px-4">Giấy Phép Lái Xe</th>
                <th className="py-3 px-4">Khóa Học & Cơ Sở</th>
                <th className="py-3 px-4">Trạng Thái & Hạn Dùng</th>
                <th className="py-3 px-4">Mã Token Xác Thực (QR Link)</th>
                <th className="py-3 px-4 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin text-emerald-700 mx-auto mb-2" />
                    <span>Đang tải danh sách học viên...</span>
                  </td>
                </tr>
              ) : certificates.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    Không tìm thấy hồ sơ học viên nào phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                certificates.map((cert, index) => {
                  const certToken = cert.qrToken || '';
                  const shortToken = certToken.length > 12 ? `${certToken.slice(0, 8)}...${certToken.slice(-6)}` : certToken;

                  return (
                    <tr key={cert.id} className="hover:bg-emerald-50/40 transition-colors">
                      {/* STT Column */}
                      <td className="py-3 px-3 text-center font-bold text-slate-500 font-mono">
                        {(currentPage - 1) * pageSize + index + 1}
                      </td>

                      {/* Certificate No */}
                      <td className="py-3 px-4 font-mono font-bold text-emerald-950">
                        <div className="font-extrabold text-xs sm:text-sm text-emerald-900">
                          {cert.certificateNumber}
                        </div>
                        <div className="text-[10px] text-slate-500 font-sans mt-0.5">
                          Số QĐ: {cert.decisionNumber}
                        </div>
                      </td>

                      {/* Driver info */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <img
                            src={cert.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'}
                            alt={cert.fullName}
                            className="w-9 h-9 rounded-xl object-cover border border-slate-200"
                          />
                          <div>
                            <div className="font-bold text-slate-900">{cert.fullName}</div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              CCCD: {currentUser ? cert.cccdNumber : `${cert.cccdNumber?.slice(0, 3)}******${cert.cccdNumber?.slice(-3)}`}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Sinh ngày: {cert.dateOfBirth}
                            </div>
                            {cert.address && formatAddressDisplay(cert.address) && (
                              <div className="text-[10px] text-slate-600 flex items-center gap-1 mt-0.5 max-w-xs truncate" title={`Địa chỉ thường trú: ${formatAddressDisplay(cert.address)}`}>
                                <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                                <span className="truncate">{formatAddressDisplay(cert.address)}</span>
                              </div>
                            )}
                            {cert.transportUnit && (
                              <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5 max-w-xs truncate" title={`Đơn vị KDVT: ${cert.transportUnit}`}>
                                <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="truncate">{cert.transportUnit}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* License */}
                      <td className="py-3 px-4">
                        <div className="font-mono font-semibold text-slate-900">
                          {currentUser ? cert.licenseNumber : `${cert.licenseNumber?.slice(0, 4)}****${cert.licenseNumber?.slice(-4)}`}
                        </div>
                        <div className="inline-block mt-0.5 px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-bold text-slate-700">
                          {cert.licenseClass}
                        </div>
                      </td>

                      {/* School & Course */}
                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-semibold text-slate-900 text-xs truncate" title={cert.schoolName}>
                          {cert.schoolName}
                        </div>
                        <div className="text-[10px] text-emerald-700 font-mono mt-0.5">
                          {cert.courseCode}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate" title={cert.courseName}>
                          {cert.courseName}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <div>{getStatusBadge(cert.status)}</div>
                        <div className="text-[10px] text-slate-500 mt-1">
                          Hiệu lực đến: <span className="font-semibold">{cert.validUntil}</span>
                        </div>
                      </td>

                      {/* Token & Direct Link */}
                      <td className="py-3 px-4 font-mono text-xs">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-2 py-1 rounded-md text-[11px] font-mono cursor-pointer border border-slate-200"
                            title={`Mã token đầy đủ: ${certToken}`}
                            onClick={() => handleCopyLink(certToken)}
                          >
                            {shortToken}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyLink(certToken)}
                            className="p-1 hover:bg-slate-100 text-slate-500 hover:text-emerald-700 rounded-md transition-colors"
                            title="Sao chép link xác thực"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {copiedToken === certToken && (
                          <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                            Đã sao chép link!
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => onViewCertificate(certToken)}
                            className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg transition-colors"
                            title="Xem trang xác thực công khai"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {currentUser && (
                            <>
                              {currentUser.role !== 'INSPECTOR' && (
                                <>
                                  {/* Edit button: Superadmin or matching School */}
                                  {(currentUser.role === 'SUPERADMIN' ||
                                    !currentUser.schoolCode ||
                                    cert.schoolCode === currentUser.schoolCode) && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditModal(cert)}
                                        className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                                        title="Sửa thông tin"
                                      >
                                        <Edit className="w-3.5 h-3.5" />
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => {
                                          setStatusModalCert(cert);
                                          setNewStatus(cert.status);
                                          setRevokeReason(cert.revokedReason || '');
                                        }}
                                        className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg transition-colors"
                                        title="Thay đổi trạng thái / Thu hồi"
                                      >
                                        <History className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  )}
                                </>
                              )}

                              {currentUser.role === 'SUPERADMIN' && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCert(cert.id, cert.fullName)}
                                  className="p-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition-colors"
                                  title="Xóa hồ sơ"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="bg-slate-50/80 border-t border-slate-200 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-2 flex-wrap">
            <span>
              Hiển thị{' '}
              <strong className="text-slate-900">
                {totalRecords === 0 ? 0 : (currentPage - 1) * pageSize + 1}
              </strong>
              {' - '}
              <strong className="text-slate-900">
                {Math.min(currentPage * pageSize, totalRecords)}
              </strong>
              {' / '}
              <strong className="text-slate-900">{totalRecords}</strong> hồ sơ học viên
            </span>
            <span className="text-slate-300">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Mỗi trang:</span>
              <div className="inline-flex rounded-lg bg-white p-0.5 border border-slate-200">
                {[10, 20, 50].map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => {
                      setPageSize(size);
                      setCurrentPage(1);
                    }}
                    className={`px-2 py-0.5 rounded-md font-bold text-xs transition-colors cursor-pointer ${
                      pageSize === size
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
              <span className="text-slate-500 text-[11px]">dòng</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage <= 1}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Về trang đầu"
            >
              <ChevronsLeft className="w-4 h-4 text-slate-700" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
              disabled={currentPage <= 1}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4 text-slate-700" />
              <span>Trước</span>
            </button>

            {/* Page number buttons */}
            <div className="flex items-center gap-1 px-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(page => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
                .map((page, idx, arr) => {
                  const prev = arr[idx - 1];
                  const showEllipsis = prev && page - prev > 1;
                  return (
                    <React.Fragment key={page}>
                      {showEllipsis && <span className="px-1 text-slate-400 font-bold">...</span>}
                      <button
                        type="button"
                        onClick={() => setCurrentPage(page)}
                        className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          currentPage === page
                            ? 'bg-emerald-700 text-white shadow-xs'
                            : 'bg-white hover:bg-slate-100 border border-slate-200 text-slate-700'
                        }`}
                      >
                        {page}
                      </button>
                    </React.Fragment>
                  );
                })}
            </div>

            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
              disabled={currentPage >= totalPages}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors cursor-pointer"
            >
              <span>Sau</span>
              <ChevronRight className="w-4 h-4 text-slate-700" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage >= totalPages}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Đến trang cuối"
            >
              <ChevronsRight className="w-4 h-4 text-slate-700" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal: Cấp Mới / Sửa Giấy Chứng Nhận */}
      {isEditModalOpen && editingCert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div role="dialog" aria-modal="true" aria-labelledby="certificate-editor-title" className="certificate-editor-dialog bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-emerald-100">
            <div className="certificate-editor-header flex items-center justify-between gap-3 border-b border-slate-100">
              <div className="flex items-center gap-2 min-w-0">
                <Award className="w-5 h-5 text-emerald-700 shrink-0" />
                <h3 id="certificate-editor-title" className="text-base sm:text-lg font-bold text-slate-900">
                  {editingCert.id ? 'Chỉnh Sửa Hồ Sơ Giấy Chứng Nhận' : 'Cấp Mới Giấy Chứng Nhận Học Viên'}
                </h3>
              </div>
              <button
                type="button"
                aria-label="Đóng cửa sổ hồ sơ"
                onClick={() => setIsEditModalOpen(false)}
                className="certificate-editor-close hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="certificate-editor-body">
            {error && (
              <div className="p-3 mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold">
                {error}
              </div>
            )}

            <form onSubmit={handleSaveCert} className="space-y-4 text-xs sm:text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Số Hiệu GCN
                  </label>
                  <input
                    type="text"
                    placeholder="Tự cấp số khi lưu"
                    value={editingCert.certificateNumber || ''}
                    onChange={(e) => setEditingCert({ ...editingCert, certificateNumber: e.target.value.trim() })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Số Quyết Định
                  </label>
                  <input
                    type="text"
                    required
                    value={editingCert.decisionNumber || ''}
                    onChange={(e) => setEditingCert({ ...editingCert, decisionNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label htmlFor="certificate-decisionDate" className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Ngày Quyết Định
                  </label>
                  <input
                    type="date"
                    required
                    id="certificate-decisionDate" value={editingCert.decisionDate || ''}
                    onChange={(e) => setEditingCert({ ...editingCert, decisionDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Personal Info */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Thông Tin Nhân Thân Người Lái Xe
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Họ và Tên Đầy Đủ
                    </label>
                    <input
                      type="text"
                      required
                      value={editingCert.fullName || ''}
                      onChange={(e) => setEditingCert({ ...editingCert, fullName: e.target.value })}
                      placeholder="NGUYỄN VĂN AN"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl uppercase font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label htmlFor="certificate-dateOfBirth" className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Ngày Tháng Năm Sinh
                    </label>
                    <input
                      type="date"
                      required
                      id="certificate-dateOfBirth" value={editingCert.dateOfBirth || ''}
                      onChange={(e) => setEditingCert({ ...editingCert, dateOfBirth: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Số Thẻ CCCD (12 số)
                    </label>
                    <input
                      type="text"
                      required
                      value={editingCert.cccdNumber || ''}
                      onChange={(e) => setEditingCert({ ...editingCert, cccdNumber: e.target.value.trim() })}
                      placeholder="079085001234"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Số GPLX (12 số)
                    </label>
                    <input
                      type="text"
                      required
                      value={editingCert.licenseNumber || ''}
                      onChange={(e) => setEditingCert({ ...editingCert, licenseNumber: e.target.value.trim() })}
                      placeholder="790158291039"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Hạng GPLX
                    </label>
                    <select
                      value={editingCert.licenseClass || 'Hạng B2'}
                      onChange={(e) => setEditingCert({ ...editingCert, licenseClass: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    >
                      <option value="Hạng B1">Hạng B1</option>
                      <option value="Hạng B2">Hạng B2</option>
                      <option value="Hạng C">Hạng C (Xe tải)</option>
                      <option value="Hạng D">Hạng D (Xe khách 10-30 chỗ)</option>
                      <option value="Hạng E">Hạng E (Xe khách trên 30 chỗ)</option>
                      <option value="Hạng FC">Hạng FC (Xe đầu kéo container)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Số Điện Thoại
                    </label>
                    <input
                      type="text"
                      value={editingCert.phoneNumber || ''}
                      onChange={(e) => setEditingCert({ ...editingCert, phoneNumber: e.target.value })}
                      placeholder="0903819283"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Địa Chỉ Thường Trú</span>
                    </label>
                    <input
                      type="text"
                      value={formatAddressDisplay(editingCert.address)}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (typeof editingCert.address === 'object' && editingCert.address !== null) {
                          setEditingCert({
                            ...editingCert,
                            address: { ...editingCert.address, streetAddress: val }
                          });
                        } else {
                          setEditingCert({
                            ...editingCert,
                            address: { streetAddress: val, province: 'TP. Hồ Chí Minh', district: '' }
                          });
                        }
                      }}
                      placeholder="Số 142 Nguyễn Thị Minh Khai, Phường Võ Thị Sáu, Quận 3, TP. Hồ Chí Minh"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1 flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-slate-600" />
                      <span>Đơn Vị Kinh Doanh Vận Tải (KDVT)</span>
                    </label>
                    <CatalogNameInput
                      kind="transport-units" token={token}
                      value={editingCert.transportUnit || ''}
                      selectedId={editingCert.transportUnitId}
                      onChange={(id,value) => setEditingCert({ ...editingCert, transportUnitId:id,transportUnit: value })}
                      placeholder="Công ty CP Xe khách Phương Nam hoặc Học viên tự do"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* School and Course */}
              <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 space-y-3">
                <div className="font-bold text-emerald-900 text-xs uppercase tracking-wider">
                  Trường / Cơ Sở Đào Tạo & Khóa Học
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Chọn Cơ Sở Đào Tạo (Từ Danh Mục Có Sẵn)
                    </label>
                    <select
                      value={editingCert.schoolCode || ''}
                      disabled={currentUser?.role === 'SCHOOL_ADMIN'}
                      onChange={(e) => {
                        const selected = availableSchools.find((s) => s.code === e.target.value);
                        if (selected) {
                          setEditingCert({
                            ...editingCert,
                            schoolCode: selected.code,
                            schoolName: selected.name
                          });
                        }
                      }}
                      className={`w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-semibold text-emerald-950 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden ${
                        currentUser?.role === 'SCHOOL_ADMIN' ? 'bg-slate-100 cursor-not-allowed opacity-90' : ''
                      }`}
                    >
                      {availableSchools.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                    {currentUser?.role === 'SCHOOL_ADMIN' && (
                      <p className="text-[10px] text-emerald-700 mt-1 font-medium">
                        * Cố định theo đơn vị tài khoản quản trị của bạn.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Chương Trình Tập Huấn
                    </label>
                    <CatalogNameInput
                      kind="training-programs" token={token}
                      required
                      value={editingCert.courseName || ''}
                      selectedId={editingCert.trainingProgramId}
                      onChange={(id,value) => setEditingCert({ ...editingCert, trainingProgramId:id,courseName: value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Mã Lớp Học
                    </label>
                    <input
                      type="text"
                      required
                      value={editingCert.courseCode || ''}
                      onChange={(e) => setEditingCert({ ...editingCert, courseCode: e.target.value.trim() })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Đơn Vị Phối Hợp Tổ Chức
                    </label>
                    <input
                      type="text"
                      value={editingCert.coorganizingUnit || ''}
                      onChange={(e) => setEditingCert({ ...editingCert, coorganizingUnit: e.target.value })}
                      placeholder="Hiệp hội Vận tải Ô tô TP. Hồ Chí Minh"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="certificate-issueDate" className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Ngày Cấp GCN
                    </label>
                    <input
                      type="date"
                      required
                      id="certificate-issueDate" value={editingCert.issueDate || ''}
                      onChange={(e) => setEditingCert({ ...editingCert, issueDate: e.target.value, validUntil: defaultCertificateExpiry(e.target.value) })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label htmlFor="certificate-validUntil" className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Thời Hạn Đến Ngày (Chu kỳ 5 năm)
                    </label>
                    <input
                      type="date"
                      required
                      id="certificate-validUntil" value={editingCert.validUntil || ''}
                      onChange={(e) => setEditingCert({ ...editingCert, validUntil: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Exam & Training Results */}
              <div className="p-4 bg-amber-50/50 rounded-2xl border border-amber-200 space-y-3">
                <div className="font-bold text-amber-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-amber-700" />
                  <span>Kết Quả Đào Tạo & Kiểm Tra Tập Huấn</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Điều Kiện Kiểm Tra
                    </label>
                    <input
                      type="text"
                      value={editingCert.examEligibility || 'Đủ điều kiện kiểm tra'}
                      onChange={(e) => setEditingCert({ ...editingCert, examEligibility: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Điểm Kiểm Tra (Thang điểm 10)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={(() => {
                        const raw = editingCert.examScore ?? '';
                        const m = String(raw).match(/^([0-9.]+)/);
                        return m ? m[1] : '';
                      })()}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') {
                          setEditingCert({ ...editingCert, examScore: '', examResult: 'Không đạt' });
                          return;
                        }
                        const num = parseFloat(val);
                        const autoResult = (!isNaN(num) && num >= 5) ? 'Đạt' : 'Không đạt';
                        setEditingCert({
                          ...editingCert,
                          examScore: isNaN(num) ? val : `${num}/10`,
                          examResult: autoResult
                        });
                      }}
                      placeholder="9.5"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                    <div className="text-[11px] text-slate-500 mt-1">
                      Thang 10: Tự động Đạt khi ≥ 5.0, Không đạt khi &lt; 5.0
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Kết Quả (Tự Động)
                    </label>
                    <select
                      disabled
                      value={editingCert.examResult || 'Không đạt'}
                      onChange={(e) => setEditingCert({ ...editingCert, examResult: e.target.value as any })}
                      className={`w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-hidden ${
                        (editingCert.examResult || 'Đạt') === 'Đạt' ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      <option value="Đạt">Đạt (≥ 5.0)</option>
                      <option value="Không đạt">Không đạt (&lt; 5.0)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="certificate-trainingStartDate" className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Thời Gian Bắt Đầu
                    </label>
                    <input
                      type="date"
                      id="certificate-trainingStartDate" value={editingCert.trainingStartDate || ''}
                      onChange={(e) => setEditingCert({ ...editingCert, trainingStartDate: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label htmlFor="certificate-trainingEndDate" className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Thời Gian Kết Thúc
                    </label>
                    <input
                      type="date"
                      id="certificate-trainingEndDate" value={editingCert.trainingEndDate || ''}
                      onChange={(e) => setEditingCert({ ...editingCert, trainingEndDate: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label htmlFor="certificate-examDate" className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Ngày Kiểm Tra
                    </label>
                    <input
                      type="date"
                      id="certificate-examDate" value={editingCert.examDate || ''}
                      onChange={(e) => setEditingCert({ ...editingCert, examDate: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                >
                  {saving ? 'Đang lưu...' : editingCert.id ? 'Cập Nhật Hồ Sơ' : 'Cấp Mới Giấy Chứng Nhận'}
                </button>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Đổi Trạng Thái / Thu Hồi */}
      {statusModalCert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-emerald-100">
            <h3 className="text-base font-bold text-slate-900 mb-2">
              Đổi Trạng Thái Giấy Chứng Nhận
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Học viên: <strong className="text-slate-900">{statusModalCert.fullName}</strong> - Số GCN: <span className="font-mono">{statusModalCert.certificateNumber}</span>
            </p>

            <form onSubmit={handleUpdateStatusSubmit} className="space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Chọn Trạng Thái
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as CertificateStatus)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                >
                  <option value="ISSUED">ISSUED - Đã cấp (Có hiệu lực)</option>
                  <option value="PENDING">PENDING - Chờ xử lý</option>
                  <option value="EXPIRED">EXPIRED - Hết hiệu lực</option>
                  <option value="REVOKED">REVOKED - Thu hồi chứng nhận</option>
                </select>
              </div>

              {newStatus === 'REVOKED' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Lý Do Thu Hồi Chứng Nhận
                  </label>
                  <textarea
                    required
                    value={revokeReason}
                    onChange={(e) => setRevokeReason(e.target.value)}
                    rows={3}
                    placeholder="Vi phạm quy chế kiểm tra hoặc bị tước giấy phép..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-hidden"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStatusModalCert(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                >
                  {saving ? 'Đang lưu...' : 'Lưu Trạng Thái'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Nhập Excel */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-7 shadow-2xl border border-emerald-100 my-8 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  Nhập Dữ Liệu Học Viên Từ Tệp Excel
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportRows([]);
                  setImportResult(null);
                }}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step 1: Download Standard Sample File */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                  <span>Tệp Mẫu Chuẩn Excel (.xlsx) [Định dạng TEXT sẵn]</span>
                </div>
                <p className="text-[11px] text-emerald-700 mt-0.5">
                  Tải tệp mẫu đã được cấu hình sẵn 100% cột là dạng Text để nhập dữ liệu chính xác.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadSampleExcel}
                disabled={downloadingSample}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shrink-0 shadow-xs transition-colors disabled:opacity-60"
              >
                <FileDown className={`w-4 h-4 ${downloadingSample ? 'animate-bounce' : ''}`} />
                <span>{downloadingSample ? 'Đang tải...' : 'Tải File Mẫu (.xlsx)'}</span>
              </button>
            </div>

            {/* Step 2: Strict Text Format & Detailed Specifications Notice */}
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 text-xs text-amber-900 space-y-2.5">
              <div className="font-extrabold flex items-center justify-between flex-wrap gap-2 text-amber-950 uppercase text-[11px] tracking-wide">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>QUY ĐỊNH BẮT BUỘC: TOÀN BỘ CỘT PHẢI ĐỊNH DẠNG LÀ TEXT (VĂN BẢN)</span>
                </div>
                <span className="text-[10px] lowercase font-normal bg-amber-200/80 px-2 py-0.5 rounded-full text-amber-900 font-mono">
                  Excel Format: @ (Text)
                </span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Tất cả các cột dữ liệu trong tệp Excel (đặc biệt là <strong>Số CCCD</strong>, <strong>Số GPLX</strong>, <strong>Số điện thoại</strong>, <strong>Ngày sinh</strong>) <strong>BẮT BUỘC ĐỊNH DẠNG LÀ TEXT (Ký hiệu @)</strong> trước khi lưu file.
              </p>

              {/* Specification Table */}
              <div className="bg-white/80 rounded-xl p-3 border border-amber-200 text-[11px] space-y-1.5">
                <div className="font-bold text-slate-800 text-xs mb-1 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 text-amber-700" />
                  <span>Quy chuẩn kiểm tra dữ liệu từng cột (Tiêu chí hợp lệ):</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 bg-slate-50 rounded-lg">
                    <span className="font-bold text-slate-900 block">• Số CCCD (12 số):</span>
                    <span className="text-slate-600">Bắt buộc đúng 12 chữ số (VD: <code className="font-mono text-emerald-800">079087019284</code>). Bắt buộc format Text để không bị Excel cắt mất số 0 đầu.</span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg">
                    <span className="font-bold text-slate-900 block">• Số GPLX (12 số):</span>
                    <span className="text-slate-600">Bắt buộc đúng 12 chữ số theo phôi thẻ PET chuẩn (VD: <code className="font-mono text-emerald-800">790158291039</code>).</span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg">
                    <span className="font-bold text-slate-900 block">• Ngày sinh:</span>
                    <span className="text-slate-600">Định dạng <code className="font-mono">DD/MM/YYYY</code> (VD: 14/08/1987) hoặc <code className="font-mono">YYYY-MM-DD</code>. Tuổi lái xe từ 1940 đến 2008.</span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg">
                    <span className="font-bold text-slate-900 block">• Họ và tên & Số điện thoại:</span>
                    <span className="text-slate-600">Họ tên chữ in hoa tiếng Việt có dấu. Số điện thoại 10 chữ số bắt đầu bằng 0 (VD: <code className="font-mono">0903819283</code>).</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3: File Upload Area */}
            <div>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50/20 hover:bg-emerald-50/50 rounded-2xl p-4 sm:p-5 text-center cursor-pointer transition-colors"
              >
                <Upload className="w-7 h-7 text-emerald-600 mx-auto mb-1.5" />
                <span className="text-xs sm:text-sm font-bold text-slate-800 block">
                  {selectedFileName
                    ? `Tệp đã chọn: ${selectedFileName} (Nhấp để chọn lại)`
                    : 'Nhấp vào đây để chọn tệp Excel (.xlsx, .xls) từ máy tính'}
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Hệ thống tự động đọc và kiểm tra đối soát toàn diện từng dòng dữ liệu
                </span>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".xlsx, .xls"
                className="hidden"
              />
            </div>

            {/* Step 4: Data Validation Status & Summary Badges */}
            {importRows.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs">
                  <div className="font-bold text-slate-800 flex items-center gap-2">
                    <span>Kết Quả Kiểm Tra Dữ Liệu:</span>
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-800 font-mono font-bold text-[11px]">
                      Tổng: {importRows.length} dòng
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px] border border-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{validRowCount} hợp lệ</span>
                    </span>
                    {validationErrors.length > 0 && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-100 text-red-800 font-bold text-[11px] border border-red-300">
                        <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                        <span>{validationErrors.length} phát hiện lỗi</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* ERROR ALERT BOX WITH TEXT EXPORT */}
                {validationErrors.length > 0 && (
                  <div className="bg-red-50 border border-red-300 rounded-2xl p-4 text-xs text-red-900 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-red-200/80 pb-2.5">
                      <div className="flex items-center gap-2 font-bold text-red-950 text-xs sm:text-sm">
                        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                        <span>Phát hiện {validationErrors.length} dòng bị sai lệch định dạng:</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleExportErrorReportText}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors shrink-0"
                      >
                        <FileText className="w-4 h-4" />
                        <span>Xuất Báo Cáo Lỗi (.txt)</span>
                      </button>
                    </div>

                    <p className="text-[11px] text-red-800 leading-relaxed">
                      Các dòng dưới đây không đạt yêu cầu về CCCD (12 số), GPLX (12 số) hoặc Ngày sinh. Bạn có thể nhấn <strong>Xuất Báo Cáo Lỗi (.txt)</strong> để tải danh sách chi tiết về sửa lại, hoặc chọn <strong>Chỉ nhập các dòng hợp lệ</strong> bên dưới.
                    </p>

                    <div className="max-h-48 overflow-y-auto border border-red-200 rounded-xl bg-white overflow-x-auto text-[11px]">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-red-100/70 text-red-900 font-bold border-b border-red-200">
                          <tr>
                            <th className="p-2 w-14">Dòng</th>
                            <th className="p-2">Học Viên</th>
                            <th className="p-2">CCCD / GPLX</th>
                            <th className="p-2">Ngày Sinh</th>
                            <th className="p-2">Chi Tiết Lỗi Cần Sửa</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-red-100">
                          {validationErrors.map((err) => (
                            <tr key={err.row} className="hover:bg-red-50/50">
                              <td className="p-2 font-mono font-bold text-red-700">#{err.row}</td>
                              <td className="p-2 font-semibold text-slate-900">{err.fullName}</td>
                              <td className="p-2 font-mono text-[10px]">
                                <div>CCCD: <span className="font-bold">{err.cccd || 'Trống'}</span></div>
                                <div>GPLX: <span className="font-bold">{err.license || 'Trống'}</span></div>
                              </td>
                              <td className="p-2 font-mono text-[10px]">{err.dob || 'Trống'}</td>
                              <td className="p-2 text-red-700 text-[10px] space-y-0.5">
                                {err.reasons.map((r, rIdx) => (
                                  <div key={rIdx} className="flex items-start gap-1">
                                    <span className="text-red-500 font-bold">•</span>
                                    <span>{r}</span>
                                  </div>
                                ))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ALL VALID BANNER */}
                {validationErrors.length === 0 && (
                  <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-3.5 text-xs text-emerald-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      <strong>Tuyệt vời!</strong> 100% dữ liệu ({validRowCount} học viên) đã vượt qua các bước kiểm tra hợp lệ và sẵn sàng nhập vào hệ thống.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Result Message */}
            {importResult && (
              <div className={`p-3.5 rounded-2xl border text-xs ${
                importResult.success
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-red-50 border-red-300 text-red-900'
              }`}>
                <div className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>
                    Đã nhập thành công <strong>{importResult.importedCount || importResult.inserted || 0}</strong> học viên vào cơ sở dữ liệu!
                  </span>
                </div>
                {importResult.errors && importResult.errors.length > 0 && (
                  <div className="mt-2 text-[11px] text-amber-800">
                    <span className="font-semibold">Cảnh báo:</span>
                    <ul className="list-disc pl-4 mt-1 space-y-0.5">
                      {importResult.errors.slice(0, 3).map((err: string, i: number) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-between flex-wrap gap-2 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2">
                {validationErrors.length > 0 && (
                  <button
                    type="button"
                    onClick={handleExportErrorReportText}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5 text-red-600" />
                    <span>Tải Báo Cáo Lỗi (.txt)</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsImportModalOpen(false);
                    setImportRows([]);
                    setValidationErrors([]);
                    setImportResult(null);
                    setSelectedFileName('');
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
                >
                  Đóng
                </button>

                {/* Option 1: Import only valid rows if some rows have errors */}
                {validationErrors.length > 0 && validRowCount > 0 && (
                  <button
                    type="button"
                    onClick={() => handleImportSubmit(true)}
                    disabled={importing}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
                  >
                    {importing ? 'Đang nhập...' : `Chỉ Nhập ${validRowCount} Dòng Hợp Lệ`}
                  </button>
                )}

                {/* Option 2: Normal import when all rows are valid */}
                {validationErrors.length === 0 && (
                  <button
                    type="button"
                    onClick={() => handleImportSubmit(false)}
                    disabled={importing || importRows.length === 0}
                    className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
                  >
                    {importing ? 'Đang nhập dữ liệu...' : `Tiến Hành Nhập (${importRows.length} học viên)`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
