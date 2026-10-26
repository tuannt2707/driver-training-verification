import { apiFetch } from '../utils/api';
import React, { useState, useEffect } from 'react';
import {
  Building2,
  MapPin,
  Phone,
  Mail,
  Award,
  CheckCircle2,
  Search,
  ArrowRight,
  ShieldCheck,
  Users,
  Plus,
  Edit,
  X,
  RefreshCw,
  AlertCircle,
  Check,
  Filter,
  ShieldAlert,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { DrivingSchool, AdminUser } from '../types';

interface Props {
  currentUser?: AdminUser | null;
  token?: string;
  onSelectSchoolSample: (sampleToken: string) => void;
  onNavigateLookup: () => void;
  initialStatusFilter?: 'ALL' | 'ACTIVE' | 'DISABLED';
  onStatusFilterChange?: (status: 'ALL' | 'ACTIVE' | 'DISABLED') => void;
}

export const SchoolDirectory: React.FC<Props> = ({
  currentUser,
  token,
  onSelectSchoolSample,
  onNavigateLookup: _onNavigateLookup,
  initialStatusFilter = 'ALL',
  onStatusFilterChange
}) => {
  const [schools, setSchools] = useState<DrivingSchool[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'DISABLED'>(initialStatusFilter);

  // Pagination & Display Limit (10, 20, 50)
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  useEffect(() => {
    if (initialStatusFilter && initialStatusFilter !== statusFilter) {
      setStatusFilter(initialStatusFilter);
    }
  }, [initialStatusFilter]);

  // Modal State for Thêm mới / Sửa
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<Partial<DrivingSchool> | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchSchools = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/public/schools');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setSchools(data.data);
      }
    } catch (err) {
      console.error('Lỗi tải danh sách trường:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchools();
  }, []);

  // Filter logic
  const filteredSchools = schools.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.address && s.address.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesClass =
      selectedClass === 'ALL' ||
      (s.classes && s.classes.some((c) => c.toLowerCase().includes(selectedClass.toLowerCase())));

    const isSchoolActive = s.isActive !== false && s.status !== 'DISABLED';
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && isSchoolActive) ||
      (statusFilter === 'DISABLED' && !isSchoolActive);

    return matchesSearch && matchesClass && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filteredSchools.length / pageSize));
  const paginatedSchools = filteredSchools.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Open Create Modal
  const handleOpenCreate = () => {
    setFormError(null);
    setEditingSchool({
      name: '',
      code: '',
      address: '',
      phone: '',
      email: '',
      licenseNumber: 'Quyết định số .../QĐ-SXD',
      classes: ['Hạng B1', 'Hạng B2', 'Hạng C'],
      certifiedCount: 0,
      sampleToken: '',
      isActive: true,
      status: 'ACTIVE'
    });
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (school: DrivingSchool) => {
    setFormError(null);
    setEditingSchool({
      ...school,
      isActive: school.isActive !== false && school.status !== 'DISABLED'
    });
    setIsModalOpen(true);
  };

  // Save School (Create or Update)
  const handleSaveSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSchool) return;

    if (!editingSchool.name?.trim() || !editingSchool.code?.trim()) {
      setFormError('Vui lòng nhập Tên trường và Mã trường.');
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const isNew = !editingSchool.id;
      const url = isNew ? '/api/schools' : `/api/schools/${editingSchool.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const payload = {
        ...editingSchool,
        isActive: editingSchool.isActive !== false,
        status: editingSchool.isActive ? 'ACTIVE' : 'DISABLED'
      };

      const res = await apiFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setFormError(data.error || 'Có lỗi xảy ra khi lưu thông tin cơ sở.');
      } else {
        setIsModalOpen(false);
        setEditingSchool(null);
        await fetchSchools();
        alert(isNew ? 'Đã thêm mới cơ sở đào tạo thành công!' : 'Đã cập nhật thông tin cơ sở thành công!');
      }
    } catch (err: any) {
      setFormError('Lỗi kết nối máy chủ.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="module-page directory-page space-y-6 max-w-7xl mx-auto">
      {/* Intro Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
          <Building2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>Danh Mục Cơ Sở Đào Tạo Được Cấp Phép</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
          Các Trường & Trung Tâm Đào Tạo Lái Xe
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 max-w-2xl mx-auto">
          Danh sách các cơ sở giáo dục nghề nghiệp, trung tâm sát hạch lái xe trực thuộc và phối hợp cùng Sở Xây dựng TP. Hồ Chí Minh trong công tác đào tạo, tập huấn nghiệp vụ vận tải.
        </p>
      </div>

      {/* Filter, Search & Action Bar */}
      <div className="bg-white rounded-2xl border border-emerald-100 p-4 shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="flex-1 flex items-center gap-2 bg-emerald-50/40 border border-emerald-200 rounded-xl px-3 py-2">
          <Search className="w-4 h-4 text-emerald-600 shrink-0" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo tên trường, mã trường, địa chỉ..."
            className="w-full bg-transparent text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-hidden"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Class Filter */}
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 focus:outline-hidden"
          >
            <option value="ALL">Tất cả hạng bằng</option>
            <option value="B1">Hạng B1</option>
            <option value="B2">Hạng B2</option>
            <option value="C">Hạng C (Tải)</option>
            <option value="D">Hạng D (Khách)</option>
            <option value="E">Hạng E (Xe lớn)</option>
            <option value="FC">Hạng FC (Đầu kéo)</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 focus:outline-hidden"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="ACTIVE">Còn hoạt động</option>
            <option value="DISABLED">Tạm ngưng / Disable</option>
          </select>

          {/* Thêm mới Button (Superadmin Only) */}
          {currentUser?.role === 'SUPERADMIN' && (
            <button
              type="button"
              onClick={handleOpenCreate}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm mới</span>
            </button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-emerald-100 p-12 text-center shadow-xs">
          <RefreshCw className="w-8 h-8 animate-spin text-emerald-600 mx-auto" />
          <p className="mt-2 text-sm text-slate-500 font-medium">Đang tải danh sách cơ sở đào tạo...</p>
        </div>
      ) : filteredSchools.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500">
          Không tìm thấy cơ sở nào phù hợp với điều kiện tìm kiếm.
        </div>
      ) : (
        /* Schools Data Table */
        <div className="bg-white rounded-2xl border border-emerald-100/90 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-emerald-50/70 border-b border-emerald-100 text-emerald-950 uppercase text-[11px] font-extrabold tracking-wider">
                  <th className="py-3.5 px-3.5 text-center w-12">STT</th>
                  <th className="py-3.5 px-3.5 w-32">Mã Cơ Sở</th>
                  <th className="py-3.5 px-4 min-w-[280px]">Tên Cơ Sở & Thông Tin Liên Hệ</th>
                  <th className="py-3.5 px-4 min-w-[170px]">Quyết Định Cấp Phép</th>
                  <th className="py-3.5 px-4 min-w-[200px]">Hạng Đào Tạo</th>
                  <th className="py-3.5 px-3.5 text-center w-28">Đã Cấp</th>
                  <th className="py-3.5 px-3.5 text-center w-32">Trạng Thái</th>
                  <th className="py-3.5 px-3.5 text-center w-36">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedSchools.map((school, index) => {
                  const isSchoolActive = school.isActive !== false && school.status !== 'DISABLED';

                  return (
                    <tr
                      key={school.id}
                      className={`transition-colors hover:bg-emerald-50/40 ${
                        !isSchoolActive ? 'bg-slate-50/70 opacity-80' : ''
                      }`}
                    >
                      {/* STT */}
                      <td className="py-3.5 px-3.5 text-center font-bold text-slate-500 font-mono">
                        {(currentPage - 1) * pageSize + index + 1}
                      </td>

                      {/* Mã Trường */}
                      <td className="py-3.5 px-3.5">
                        <span className="font-mono text-xs font-bold text-emerald-900 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 inline-block whitespace-nowrap">
                          {school.code}
                        </span>
                      </td>

                      {/* Tên Cơ Sở & Liên hệ */}
                      <td className="py-3.5 px-4 space-y-1">
                        <div className="font-bold text-slate-900 text-sm leading-snug">
                          {school.name}
                        </div>
                        {school.address && (
                          <div className="flex items-start gap-1.5 text-xs text-slate-600">
                            <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                            <span className="line-clamp-2">{school.address}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                          {school.phone && (
                            <span className="flex items-center gap-1 font-mono">
                              <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span>{school.phone}</span>
                            </span>
                          )}
                          {school.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span>{school.email}</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Quyết Định Cấp Phép */}
                      <td className="py-3.5 px-4 text-slate-700 text-xs">
                        {school.licenseNumber ? (
                          <div className="flex items-start gap-1 font-medium">
                            <Award className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                            <span>{school.licenseNumber}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Chưa cập nhật</span>
                        )}
                      </td>

                      {/* Hạng Đào Tạo */}
                      <td className="py-3.5 px-4">
                        {school.classes && school.classes.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {school.classes.map((cls, idx) => (
                              <span
                                key={idx}
                                className="text-[11px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200"
                              >
                                {cls}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs italic">Tất cả hạng</span>
                        )}
                      </td>

                      {/* Số Học Viên Đã Cấp */}
                      <td className="py-3.5 px-3.5 text-center">
                        <div className="inline-flex items-center gap-1 font-mono font-bold text-sm text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                          <Users className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{school.certifiedCount || 0}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">học viên</div>
                      </td>

                      {/* Trạng Thái */}
                      <td className="py-3.5 px-3.5 text-center whitespace-nowrap">
                        {isSchoolActive ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Còn hoạt động</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-300">
                            <ShieldAlert className="w-3.5 h-3.5 text-slate-500" />
                            <span>Tạm ngưng</span>
                          </span>
                        )}
                      </td>

                      {/* Thao Tác */}
                      <td className="py-3.5 px-3.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {school.sampleToken && (
                            <button
                              type="button"
                              onClick={() => onSelectSchoolSample(school.sampleToken)}
                              title="Xem mẫu Giấy chứng nhận điện tử của cơ sở này"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors"
                            >
                              <span>Mẫu GCN</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}

                          {currentUser?.role === 'SUPERADMIN' && (
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(school)}
                              title="Sửa thông tin cơ sở đào tạo"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:text-emerald-800 bg-slate-100 hover:bg-emerald-50 rounded-lg border border-slate-200 transition-colors"
                            >
                              <Edit className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Sửa</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table Summary Footer */}
          <div className="bg-slate-50 px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap text-xs text-slate-500">
            <div className="flex items-center gap-2 flex-wrap">
              <span>
                Hiển thị <strong className="text-slate-800">{filteredSchools.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}</strong> - <strong className="text-slate-800">{Math.min(currentPage * pageSize, filteredSchools.length)}</strong> / <strong className="text-slate-800">{filteredSchools.length}</strong> cơ sở đào tạo
              </span>
              <span className="text-slate-300">|</span>
              <div className="flex items-center gap-1.5">
                <span>Hiện:</span>
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
                <span>dòng</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                <span>Hoạt động: {schools.filter((s) => s.isActive !== false && s.status !== 'DISABLED').length}</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-slate-400 inline-block"></span>
                <span>Tạm ngưng: {schools.filter((s) => s.isActive === false || s.status === 'DISABLED').length}</span>
              </span>
              {totalPages > 1 && (
                <div className="flex items-center gap-1 ml-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className="p-1 rounded-md border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-semibold text-slate-700 px-1">
                    {currentPage}/{totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="p-1 rounded-md border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: THÊM MỚI / SỬA CƠ SỞ ĐÀO TẠO */}
      {isModalOpen && editingSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl border border-slate-200 my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-600" />
                <span className="font-bold text-slate-800 text-sm sm:text-base">
                  {editingSchool.id ? 'Sửa Thông Tin Cơ Sở Đào Tạo' : 'Thêm Mới Cơ Sở Đào Tạo'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSchool} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto text-xs sm:text-sm">
              {formError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Toggle "Còn hoạt động" (Disable thay vì xóa dữ liệu) */}
              <div className="p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-2xl">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <span className="font-extrabold text-slate-800 text-xs sm:text-sm flex items-center gap-1.5">
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span>Trạng thái: Còn hoạt động</span>
                    </span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Tích chọn để hiển thị cơ sở đang hoạt động. Bỏ tích để <strong>Tạm ngưng (Disable)</strong> cơ sở này mà <strong>không xóa dữ liệu</strong> trong hệ thống.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={editingSchool.isActive !== false}
                    onChange={(e) => setEditingSchool({ ...editingSchool, isActive: e.target.checked })}
                    className="w-5 h-5 accent-emerald-600 rounded cursor-pointer shrink-0"
                  />
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Tên Trường / Cơ Sở Đào Tạo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editingSchool.name || ''}
                  onChange={(e) => setEditingSchool({ ...editingSchool, name: e.target.value })}
                  placeholder="VD: Trường Trung cấp Giao thông Vận tải Miền Nam..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Mã Cơ Sở (Code) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingSchool.id)}
                    value={editingSchool.code || ''}
                    onChange={(e) => setEditingSchool({ ...editingSchool, code: e.target.value.toUpperCase() })}
                    placeholder="VD: TCGTVT-MN"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono uppercase focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Số Quyết Định / Giấy Phép
                  </label>
                  <input
                    type="text"
                    value={editingSchool.licenseNumber || ''}
                    onChange={(e) => setEditingSchool({ ...editingSchool, licenseNumber: e.target.value })}
                    placeholder="VD: Quyết định số 286/QĐ-SXD"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Số Điện Thoại Hotline
                  </label>
                  <input
                    type="text"
                    value={editingSchool.phone || ''}
                    onChange={(e) => setEditingSchool({ ...editingSchool, phone: e.target.value })}
                    placeholder="(028) 3931 7977..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Email Liên Hệ
                  </label>
                  <input
                    type="email"
                    value={editingSchool.email || ''}
                    onChange={(e) => setEditingSchool({ ...editingSchool, email: e.target.value })}
                    placeholder="daotao@truong.edu.vn"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Địa Chỉ Trụ Sở / Cơ Sở Đào Tạo
                </label>
                <input
                  type="text"
                  value={editingSchool.address || ''}
                  onChange={(e) => setEditingSchool({ ...editingSchool, address: e.target.value })}
                  placeholder="Số nhà, đường, phường, quận/huyện, TP.HCM"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Chương Trình Đào Tạo (Nhập phân cách bằng dấu phẩy)
                </label>
                <input
                  type="text"
                  value={Array.isArray(editingSchool.classes) ? editingSchool.classes.join(', ') : ''}
                  onChange={(e) =>
                    setEditingSchool({
                      ...editingSchool,
                      classes: e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                    })
                  }
                  placeholder="Hạng B1, Hạng B2, Hạng C, Hạng D, Hạng E (Xe khách), Hạng FC"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Số Học Viên Đã Cấp (Hệ Thống Tự Động Tính)
                  </label>
                  <div className="w-full px-3 py-2 bg-emerald-50/70 border border-emerald-200 rounded-xl text-emerald-900 font-mono font-bold text-sm flex items-center justify-between">
                    <span>{editingSchool.certifiedCount || 0} học viên</span>
                    <span className="text-[10px] font-sans font-normal text-emerald-700 bg-white px-2 py-0.5 rounded-md border border-emerald-200">
                      Tự động tính từ hồ sơ GCN
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Số lượng học viên được tổng hợp trực tiếp từ danh sách học viên thực tế của cơ sở trong CSDL.
                  </p>
                </div>


              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                >
                  {saving ? 'Đang lưu...' : editingSchool.id ? 'Cập Nhật Cơ Sở' : 'Thêm Mới Cơ Sở'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
