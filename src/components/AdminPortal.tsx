import { apiFetch } from '../utils/api';
import React, { useState, useEffect } from 'react';
import {
  Users,
  ShieldCheck,
  ShieldAlert,
  Plus,
  Edit,
  Trash2,
  Lock,
  Unlock,
  KeyRound,
  Building2,
  UserCheck,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  History,
  Sparkles
} from 'lucide-react';
import { AdminUser, UserRole, SecuritySettings } from '../types';

interface Props {
  currentUser: AdminUser;
  token: string;
  subTab?: 'users' | 'security';
  onSubTabChange?: (sub: 'users' | 'security') => void;
  onNavigateCertificates?: () => void;
}

export const AdminPortal: React.FC<Props> = ({
  currentUser,
  token,
  subTab = 'users',
  onSubTabChange,
  onNavigateCertificates
}) => {
  const [activeTab, setActiveTab] = useState<'users' | 'security'>(subTab);

  useEffect(() => {
    if (subTab) setActiveTab(subTab);
  }, [subTab]);

  const handleTabChange = (t: 'users' | 'security') => {
    setActiveTab(t);
    if (onSubTabChange) onSubTabChange(t);
  };

  // User Management State
  const [userList, setUserList] = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  // Modal State
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<AdminUser> & { password?: string } | null>(null);
  const [userModalError, setUserModalError] = useState<string | null>(null);
  const [savingUser, setSavingUser] = useState(false);

  // Available schools for assigning to school admins
  const [availableSchools, setAvailableSchools] = useState<{ name: string; code: string }[]>([]);

  // Security Settings & Audit logs
  const [secSettings, setSecSettings] = useState<SecuritySettings | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingSec, setLoadingSec] = useState(false);

  // Load available schools
  useEffect(() => {
    apiFetch('/api/public/schools')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          setAvailableSchools(
            data.data
              .filter((s: any) => s.isActive !== false && s.status !== 'DISABLED')
              .map((s: any) => ({ name: s.name, code: s.code }))
          );
        }
      })
      .catch(() => {});
  }, []);

  // Fetch Users
  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await apiFetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setUserList(data.data || []);
        }
      }
    } catch (err) {
      console.error('Lỗi tải danh sách người dùng:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  // Fetch Security settings and logs
  const fetchSecurityData = async () => {
    setLoadingSec(true);
    try {
      const [setRes, logRes] = await Promise.all([
        apiFetch('/api/admin/security-settings', { headers: { Authorization: `Bearer ${token}` } }),
        apiFetch('/api/admin/audit-logs', { headers: { Authorization: `Bearer ${token}` } })
      ]);
      if (setRes.ok) {
        const d = await setRes.json();
        if (d.success) setSecSettings(d.data);
      }
      if (logRes.ok) {
        const d = await logRes.json();
        if (d.success) setAuditLogs(d.data || []);
      }
    } catch (err) {
      console.error('Lỗi tải cài đặt an ninh:', err);
    } finally {
      setLoadingSec(false);
    }
  };

  useEffect(() => {
    if (currentUser.role === 'SUPERADMIN') {
      if (activeTab === 'users') {
        fetchUsers();
      } else {
        fetchSecurityData();
      }
    }
  }, [activeTab, token, currentUser.role]);

  // Open Create User Modal
  const handleOpenCreateUser = () => {
    setUserModalError(null);
    setEditingUser({
      username: '',
      password: '',
      fullName: '',
      role: 'SCHOOL_ADMIN',
      schoolCode: availableSchools[0]?.code || '',
      schoolName: availableSchools[0]?.name || '',
      status: 'ACTIVE'
    });
    setIsUserModalOpen(true);
  };

  // Open Edit User Modal
  const handleOpenEditUser = (user: AdminUser) => {
    setUserModalError(null);
    setEditingUser({
      ...user,
      password: '' // empty means keep existing password
    });
    setIsUserModalOpen(true);
  };

  // Save User (Create or Update)
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    if (!editingUser.username?.trim() || !editingUser.fullName?.trim()) {
      setUserModalError('Vui lòng nhập Tên đăng nhập và Họ tên đầy đủ.');
      return;
    }

    const isNew = !editingUser.id;
    if (isNew && !editingUser.password?.trim()) {
      setUserModalError('Vui lòng đặt mật khẩu khởi tạo cho tài khoản mới.');
      return;
    }

    setSavingUser(true);
    setUserModalError(null);

    try {
      const url = isNew ? '/api/admin/users' : `/api/admin/users/${editingUser.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const payload: any = {
        username: editingUser.username.trim().toLowerCase(),
        fullName: editingUser.fullName.trim(),
        role: editingUser.role,
        schoolCode: editingUser.role === 'SCHOOL_ADMIN' ? editingUser.schoolCode : '',
        schoolName: editingUser.role === 'SCHOOL_ADMIN' ? editingUser.schoolName : '',
        status: editingUser.status
      };

      if (editingUser.password?.trim()) {
        payload.password = editingUser.password;
      }

      const res = await apiFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setUserModalError(data.error || 'Thao tác không thành công.');
      } else {
        setIsUserModalOpen(false);
        setEditingUser(null);
        await fetchUsers();
      }
    } catch (err: any) {
      setUserModalError('Lỗi kết nối máy chủ.');
    } finally {
      setSavingUser(false);
    }
  };

  // Toggle user status (Lock / Unlock)
  const handleToggleLockUser = async (user: AdminUser) => {
    if (user.username === 'admin') {
      alert('Không thể khóa tài khoản Quản trị viên tối cao (admin).');
      return;
    }

    const targetStatus = user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    const actionName = targetStatus === 'DISABLED' ? 'khóa' : 'mở khóa';

    if (!window.confirm(`Bạn có chắc muốn ${actionName} tài khoản "${user.username}"?`)) {
      return;
    }

    try {
      const res = await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: targetStatus })
      });
      if (res.ok) {
        await fetchUsers();
      } else {
        const d = await res.json();
        alert(d.error || 'Cập nhật thất bại.');
      }
    } catch (err) {
      alert('Lỗi kết nối.');
    }
  };

  // Delete user
  const handleDeleteUser = async (user: AdminUser) => {
    if (user.username === 'admin') {
      alert('Không thể xóa tài khoản Quản trị viên tối cao (admin).');
      return;
    }

    if (!window.confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản "${user.username}" (${user.fullName})?`)) {
      return;
    }

    try {
      const res = await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await fetchUsers();
      } else {
        alert(data.error || 'Xóa tài khoản không thành công.');
      }
    } catch (err) {
      alert('Lỗi kết nối.');
    }
  };

  // Save security settings
  const handleToggleSetting = async (key: keyof SecuritySettings) => {
    if (!secSettings || currentUser.role !== 'SUPERADMIN') return;
    const updated = { ...secSettings, [key]: !secSettings[key] };
    setSecSettings(updated);

    try {
      await apiFetch('/api/admin/security-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(updated)
      });
    } catch (err) {
      console.error('Failed to update setting');
    }
  };

  // Filter users
  const filteredUsers = userList.filter((u) => {
    const term = userSearchTerm.toLowerCase();
    const matchesSearch =
      u.username.toLowerCase().includes(term) ||
      u.fullName.toLowerCase().includes(term) ||
      (u.schoolName && u.schoolName.toLowerCase().includes(term));
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'SUPERADMIN':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-purple-100 text-purple-900 border border-purple-200">
            <Sparkles className="w-3 h-3 text-purple-600" />
            <span>Quản trị Sở Xây Dựng (Superadmin)</span>
          </span>
        );
      case 'SCHOOL_ADMIN':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-200">
            <Building2 className="w-3 h-3 text-emerald-600" />
            <span>Ban Quản Lý Cơ Sở Đào Tạo</span>
          </span>
        );
      case 'INSPECTOR':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-900 border border-blue-200">
            <UserCheck className="w-3 h-3 text-blue-600" />
            <span>Thanh Tra Giao Thông</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="module-page space-y-6">
      {/* Top Banner & User Profile */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-emerald-100 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold mb-2">
            <Lock className="w-3.5 h-3.5 text-emerald-600" />
            <span>Cổng Quản Trị Hệ Thống - Sở Xây dựng TP. Hồ Chí Minh</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            {currentUser.role === 'SUPERADMIN' ? 'Quản Trị Cán Bộ, Phân Quyền & An Ninh' : 'Hồ Sơ Cán Bộ & Quyền Hạn Hệ Thống'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Đăng nhập với tư cách: <strong className="text-slate-900 font-bold">{currentUser.fullName}</strong> ({currentUser.username})
            {' · '}
            {getRoleBadge(currentUser.role)}
          </p>
        </div>

        {/* Tab switchers (Only for Superadmin) */}
        {currentUser.role === 'SUPERADMIN' ? (
          <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 self-start md:self-center">
            <button
              type="button"
              onClick={() => handleTabChange('users')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                activeTab === 'users'
                  ? 'bg-white text-emerald-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-4 h-4 text-emerald-600" />
              <span>Cấp Tài Khoản & Phân Quyền</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('security')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                activeTab === 'security'
                  ? 'bg-white text-emerald-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>An Ninh & F12</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onNavigateCertificates}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-colors"
            >
              <span>Đi Đến Quản Lý Học Viên & GCN</span>
            </button>
          </div>
        )}
      </div>

      {/* For Non-Superadmin (School Admin / Inspector): Dedicated Profile & Permission Summary */}
      {currentUser.role !== 'SUPERADMIN' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Account Profile Card */}
          <div className="bg-white p-6 rounded-3xl border border-emerald-100 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <UserCheck className="w-5 h-5 text-emerald-700" />
              <h3 className="text-base font-bold text-slate-900">
                Thông Tin Tài Khoản Cán Bộ
              </h3>
            </div>

            <div className="space-y-3 text-xs sm:text-sm">
              <div className="flex justify-between py-1.5 border-b border-slate-50">
                <span className="text-slate-500">Họ và tên cán bộ:</span>
                <span className="font-bold text-slate-900">{currentUser.fullName}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-50">
                <span className="text-slate-500">Tên đăng nhập:</span>
                <span className="font-mono font-semibold text-emerald-800">{currentUser.username}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-50 items-center">
                <span className="text-slate-500">Vai trò phân quyền:</span>
                <div>{getRoleBadge(currentUser.role)}</div>
              </div>
              {currentUser.role === 'SCHOOL_ADMIN' && (
                <>
                  <div className="flex justify-between py-1.5 border-b border-slate-50">
                    <span className="text-slate-500">Đơn vị trường / cơ sở:</span>
                    <span className="font-semibold text-slate-900 text-right max-w-xs">{currentUser.schoolName || 'Chưa gắn'}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-50">
                    <span className="text-slate-500">Mã cơ sở:</span>
                    <span className="font-mono font-bold text-emerald-700">{currentUser.schoolCode || '---'}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between py-1.5 border-b border-slate-50">
                <span className="text-slate-500">Trạng thái tài khoản:</span>
                <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Đang hoạt động (ACTIVE)
                </span>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={onNavigateCertificates}
                className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs sm:text-sm shadow-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <span>Chuyển Sang Module Quản Lý Học Viên & GCN</span>
              </button>
            </div>
          </div>

          {/* Permissions Matrix Card */}
          <div className="bg-white p-6 rounded-3xl border border-emerald-100 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <ShieldCheck className="w-5 h-5 text-emerald-700" />
              <h3 className="text-base font-bold text-slate-900">
                Ma Trận Phân Quyền Thực Thi
              </h3>
            </div>

            <div className="space-y-2.5 text-xs">
              {currentUser.role === 'SCHOOL_ADMIN' ? (
                <>
                  <div className="flex items-start gap-2 p-2 rounded-xl bg-emerald-50/60 text-emerald-900">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Cấp mới GCN:</strong> Có quyền cấp Giấy chứng nhận cho học viên trực thuộc đơn vị của mình.</span>
                  </div>
                  <div className="flex items-start gap-2 p-2 rounded-xl bg-emerald-50/60 text-emerald-900">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Nhập Excel (Text Format):</strong> Có quyền tải file mẫu chuẩn và nhập danh sách học viên hàng loạt.</span>
                  </div>
                  <div className="flex items-start gap-2 p-2 rounded-xl bg-emerald-50/60 text-emerald-900">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Xuất Excel:</strong> Tải toàn bộ danh sách học viên và mã Token xác thực của cơ sở.</span>
                  </div>
                  <div className="flex items-start gap-2 p-2 rounded-xl bg-emerald-50/60 text-emerald-900">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Chỉnh sửa & Trạng thái:</strong> Cập nhật thông tin học viên, đổi trạng thái sang Thu hồi nếu vi phạm.</span>
                  </div>
                  <div className="flex items-start gap-2 p-2 rounded-xl bg-slate-100 text-slate-600">
                    <X className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <span><strong>Giới hạn:</strong> Không thể xóa vĩnh viễn hồ sơ và không quản lý tài khoản người dùng khác.</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-2 p-2 rounded-xl bg-emerald-50/60 text-emerald-900">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Tra cứu toàn diện:</strong> Thanh tra hồ sơ, CCCD, GPLX của toàn bộ các cơ sở đào tạo.</span>
                  </div>
                  <div className="flex items-start gap-2 p-2 rounded-xl bg-emerald-50/60 text-emerald-900">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Quét mã QR Code:</strong> Kiểm tra tính hợp lệ pháp lý và thông tin chứng chỉ trực tuyến.</span>
                  </div>
                  <div className="flex items-start gap-2 p-2 rounded-xl bg-emerald-50/60 text-emerald-900">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Xuất dữ liệu Excel:</strong> Tải toàn bộ cơ sở dữ liệu phục vụ báo cáo và kiểm tra hiện trường.</span>
                  </div>
                  <div className="flex items-start gap-2 p-2 rounded-xl bg-slate-100 text-slate-600">
                    <X className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <span><strong>Chế độ Read-only:</strong> Không thêm mới, chỉnh sửa, thu hồi hay xóa hồ sơ của cơ sở.</span>
                  </div>
                </>
              )}
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500">
              * Để đề xuất thay đổi quyền hạn hoặc thêm tài khoản cho đơn vị, vui lòng liên hệ Sở Xây dựng TP. Hồ Chí Minh.
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 1: USER MANAGEMENT (SUPERADMIN ONLY) */}
      {currentUser.role === 'SUPERADMIN' && activeTab === 'users' && (
        <div className="space-y-4">
          {/* Action Toolbar */}
          <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-3">
              {/* Search input */}
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={userSearchTerm}
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                  placeholder="Tìm tài khoản theo Tên, Username, Trường..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              {/* Role Filter */}
              <div className="w-48">
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                >
                  <option value="ALL">-- Tất cả quyền hạn --</option>
                  <option value="SUPERADMIN">Quản trị Sở Xây dựng</option>
                  <option value="SCHOOL_ADMIN">Ban quản lý Trường</option>
                  <option value="INSPECTOR">Thanh tra viên</option>
                </select>
              </div>
            </div>

            {/* Create button */}
            <div className="flex items-center gap-2">
              {currentUser.role === 'SUPERADMIN' && (
                <button
                  type="button"
                  onClick={handleOpenCreateUser}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Cấp Tài Khoản Mới</span>
                </button>
              )}

              <button
                type="button"
                onClick={fetchUsers}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors"
                title="Tải lại danh sách"
              >
                <RefreshCw className={`w-4 h-4 ${loadingUsers ? 'animate-spin text-emerald-700' : ''}`} />
              </button>
            </div>
          </div>

          {/* User Table */}
          <div className="bg-white rounded-2xl border border-emerald-100 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4">Tên Đăng Nhập</th>
                    <th className="py-3 px-4">Họ Và Tên</th>
                    <th className="py-3 px-4">Quyền Hạn / Vai Trò</th>
                    <th className="py-3 px-4">Cơ Sở Đào Tạo Phụ Trách</th>
                    <th className="py-3 px-4">Trạng Thái</th>
                    <th className="py-3 px-4">Đăng Nhập Cuối</th>
                    <th className="py-3 px-4 text-right">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingUsers ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500">
                        <RefreshCw className="w-6 h-6 animate-spin text-emerald-700 mx-auto mb-2" />
                        <span>Đang tải danh sách tài khoản...</span>
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500">
                        Không tìm thấy tài khoản người dùng nào.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const isLocked = u.status === 'DISABLED';
                      return (
                        <tr key={u.id} className="hover:bg-emerald-50/30 transition-colors">
                          {/* Username */}
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">
                            <div className="flex items-center gap-1.5">
                              <span>{u.username}</span>
                              {u.username === 'admin' && (
                                <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-sm font-sans font-semibold">
                                  Gốc
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Full Name */}
                          <td className="py-3 px-4 font-semibold text-slate-900">
                            {u.fullName}
                          </td>

                          {/* Role */}
                          <td className="py-3 px-4">
                            {getRoleBadge(u.role)}
                          </td>

                          {/* School */}
                          <td className="py-3 px-4 max-w-xs text-xs">
                            {u.schoolName ? (
                              <div>
                                <div className="font-semibold text-slate-800 truncate" title={u.schoolName}>
                                  {u.schoolName}
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono">
                                  {u.schoolCode}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">Toàn thành phố / Sở Xây dựng</span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="py-3 px-4">
                            {isLocked ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800">
                                <Lock className="w-3 h-3 text-red-600" />
                                <span>Đang bị khóa</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Hoạt động</span>
                              </span>
                            )}
                          </td>

                          {/* Last Login */}
                          <td className="py-3 px-4 text-xs text-slate-500 font-mono">
                            {u.lastLogin ? new Date(u.lastLogin).toLocaleString('vi-VN') : 'Chưa đăng nhập'}
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {currentUser.role === 'SUPERADMIN' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditUser(u)}
                                    className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                                    title="Sửa thông tin / Phân quyền / Đổi mật khẩu"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </button>

                                  {u.username !== 'admin' && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleToggleLockUser(u)}
                                        className={`p-1.5 rounded-lg transition-colors ${
                                          isLocked
                                            ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                                            : 'bg-amber-50 hover:bg-amber-100 text-amber-700'
                                        }`}
                                        title={isLocked ? 'Mở khóa tài khoản' : 'Khóa tài khoản'}
                                      >
                                        {isLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => handleDeleteUser(u)}
                                        className="p-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition-colors"
                                        title="Xóa tài khoản"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </>
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
          </div>
        </div>
      )}

      {/* SUB-TAB 2: SECURITY & F12 SETTINGS (SUPERADMIN ONLY) */}
      {currentUser.role === 'SUPERADMIN' && activeTab === 'security' && (
        <div className="space-y-6">
          {/* Security policy cards */}
          <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-xs space-y-4">
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-emerald-700" />
              <span>Chính Sách Phòng Chống Trích Xuất Dữ Liệu (Anti-F12 & Data Leakage)</span>
            </h3>

            {secSettings && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs sm:text-sm">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-900">Chặn Phím F12 & Phím Tắt DevTools</div>
                    <div className="text-xs text-slate-500 mt-0.5">F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={secSettings.antiF12Enabled}
                    onChange={() => handleToggleSetting('antiF12Enabled')}
                    className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
                  />
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-900">Chặn Chuột Phải (Context Menu)</div>
                    <div className="text-xs text-slate-500 mt-0.5">Vô hiệu hóa menu ngữ cảnh và sao chép</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={secSettings.disableRightClick}
                    onChange={() => handleToggleSetting('disableRightClick')}
                    className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
                  />
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-900">Phát Hiện DevTools Qua Khung Cửa Sổ</div>
                    <div className="text-xs text-slate-500 mt-0.5">Đo đạc độ lệch kích thước cửa sổ browser</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={secSettings.detectDevTools}
                    onChange={() => handleToggleSetting('detectDevTools')}
                    className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Audit Logs Table */}
          <div className="bg-white rounded-2xl border border-emerald-100 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h4 className="font-bold text-slate-900 text-xs sm:text-sm">
                Nhật Ký Kiểm Toán An Ninh Mạng (Audit Logs)
              </h4>
              <button
                type="button"
                onClick={fetchSecurityData}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600"
              >
                <RefreshCw className={`w-4 h-4 ${loadingSec ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                  <tr>
                    <th className="py-2.5 px-4">Thời Gian</th>
                    <th className="py-2.5 px-4">Hành Động</th>
                    <th className="py-2.5 px-4">Đối Tượng</th>
                    <th className="py-2.5 px-4">Địa Chỉ IP</th>
                    <th className="py-2.5 px-4">Chi Tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        Chưa ghi nhận sự kiện vi phạm an ninh nào.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log: any) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500">
                          {new Date(log.timestamp).toLocaleString('vi-VN')}
                        </td>
                        <td className="py-2.5 px-4">
                          <span className="font-bold text-slate-800">{log.action}</span>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-emerald-800">
                          {log.target}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-600">
                          {log.ip}
                        </td>
                        <td className="py-2.5 px-4 text-slate-500 truncate max-w-xs" title={log.details}>
                          {log.details || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Cấp Mới / Chỉnh Sửa Tài Khoản Người Dùng & Phân Quyền */}
      {isUserModalOpen && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-emerald-100">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-700" />
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  {editingUser.id ? 'Cập Nhật Tài Khoản & Phân Quyền' : 'Cấp Tài Khoản Mới & Phân Quyền'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsUserModalOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {userModalError && (
              <div className="p-3 mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold">
                {userModalError}
              </div>
            )}

            <form onSubmit={handleSaveUser} className="space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Tên Đăng Nhập (Username)
                </label>
                <input
                  type="text"
                  required
                  disabled={Boolean(editingUser.id)}
                  value={editingUser.username || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, username: e.target.value.toLowerCase().trim() })}
                  placeholder="canbo.daotao"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-hidden disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Họ Và Tên Cán Bộ
                </label>
                <input
                  type="text"
                  required
                  value={editingUser.fullName || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, fullName: e.target.value })}
                  placeholder="Nguyễn Văn An"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  {editingUser.id ? 'Đặt Lại Mật Khẩu Mới (Để trống nếu giữ nguyên)' : 'Mật Khẩu Khởi Tạo'}
                </label>
                <input
                  type="password"
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  value={editingUser.password || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Phân Quyền / Vai Trò Cán Bộ
                </label>
                <select
                  value={editingUser.role || 'SCHOOL_ADMIN'}
                  onChange={(e) => {
                    const r = e.target.value as UserRole;
                    setEditingUser({
                      ...editingUser,
                      role: r,
                      schoolCode: r === 'SCHOOL_ADMIN' ? (editingUser.schoolCode || availableSchools[0]?.code || '') : '',
                      schoolName: r === 'SCHOOL_ADMIN' ? (editingUser.schoolName || availableSchools[0]?.name || '') : ''
                    });
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                >
                  <option value="SUPERADMIN">Quản Trị Sở Xây Dựng (Toàn quyền hệ thống & phân quyền)</option>
                  <option value="SCHOOL_ADMIN">Quản Trị Cơ Sở Đào Tạo (Quản lý học viên & cấp GCN của trường)</option>
                  <option value="INSPECTOR">Thanh Tra Giao Thông (Đối soát & kiểm tra hiện trường)</option>
                </select>
              </div>

              {editingUser.role === 'SCHOOL_ADMIN' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Liên Kết Cơ Sở Đào Tạo
                  </label>
                  <select
                    value={editingUser.schoolCode || ''}
                    onChange={(e) => {
                      const sel = availableSchools.find((s) => s.code === e.target.value);
                      if (sel) {
                        setEditingUser({
                          ...editingUser,
                          schoolCode: sel.code,
                          schoolName: sel.name
                        });
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  >
                    {availableSchools.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Trạng Thái Tài Khoản
                </label>
                <select
                  value={editingUser.status || 'ACTIVE'}
                  onChange={(e) => setEditingUser({ ...editingUser, status: e.target.value as any })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                >
                  <option value="ACTIVE">ACTIVE - Hoạt động bình thường</option>
                  <option value="DISABLED">DISABLED - Đang bị khóa</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                >
                  {savingUser ? 'Đang lưu...' : editingUser.id ? 'Cập Nhật Tài Khoản' : 'Cấp Tài Khoản Mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
