import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { CertificateVerificationView } from './components/CertificateVerificationView';
import { StaffLogin } from './components/StaffLogin';
import { Dashboard } from './components/Dashboard';
import { ApiKeyManagement } from './components/ApiKeyManagement';
import { CatalogManagement } from './components/CatalogManagement';
import { PublicLookup } from './components/PublicLookup';
const CertificateManagement = lazy(() => import('./components/CertificateManagement').then(m=>({default:m.CertificateManagement})));
import { SchoolDirectory } from './components/SchoolDirectory';
import { AdminPortal } from './components/AdminPortal';
import { Footer } from './components/Footer';
import { AuthModal } from './components/AuthModal';
import { DigitalCertificateCardModal } from './components/DigitalCertificateCardModal';
import { SecurityAlertModal } from './components/SecurityAlertModal';
import { useSecurityShield } from './utils/security';
import { useRouter } from './utils/router';
import { AdminUser, PublicCertificateView } from './types';
import { ShieldAlert, Lock, X, Sparkles, User, AlertCircle, Building2 } from 'lucide-react';

export default function App() {
  const { route, navigate } = useRouter();

  // Auth State
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [authToken, setAuthToken] = useState<string>('');
  const [authInitialized, setAuthInitialized] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Left Sidebar State (Desktop & Mobile) & Sub-filters
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth >= 1024);
  const [certStatusFilter, setCertStatusFilter] = useState<string>('ALL');
  const [schoolStatusFilter, setSchoolStatusFilter] = useState<'ALL' | 'ACTIVE' | 'DISABLED'>('ALL');

  // Modals
  const [selectedCardCert, setSelectedCardCert] = useState<PublicCertificateView | null>(null);
  const [showDevToolsAlert, setShowDevToolsAlert] = useState(false);

  // Security Shield
  const { isDevToolsOpen, securityNotice, closeNotice } = useSecurityShield();

  useEffect(() => {
    if (isDevToolsOpen) {
      setShowDevToolsAlert(true);
    }
  }, [isDevToolsOpen]);

  const SESSION_EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 hours auto-logout

  // Verify stored tokens with the server before rendering authenticated routes.
  useEffect(() => {
    const controller = new AbortController();
    const restore = async () => {
      try {
        const token = localStorage.getItem('driver_admin_token');
        if (token) {
          const response = await fetch('/api/auth/me', {headers:{Authorization:'Bearer '+token},signal:controller.signal});
          if (!response.ok) throw new Error('Invalid session');
          const data = await response.json();
          if (!controller.signal.aborted) {setAuthToken(token);setCurrentUser(data.user);}
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          localStorage.removeItem('driver_admin_token');
          localStorage.removeItem('driver_admin_user');
          localStorage.removeItem('driver_admin_login_time');
        }
      } finally {if (!controller.signal.aborted) setAuthInitialized(true);}
    };
    void restore();
    return () => controller.abort();
  }, []);

  // Periodic active session timer to auto-logout when 24h elapses
  useEffect(() => {
    if (!currentUser) return;

    const interval = setInterval(() => {
      try {
        const storedLoginTime = localStorage.getItem('driver_admin_login_time');
        const loginTimestamp = storedLoginTime ? parseInt(storedLoginTime, 10) : 0;
        if (!loginTimestamp || Date.now() - loginTimestamp > SESSION_EXPIRATION_MS) {
          handleLogout();
        }
      } catch {}
    }, 60 * 1000); // Check every minute

    return () => clearInterval(interval);
  }, [currentUser]);

  const handleLoginSuccess = (user: AdminUser, token: string) => {
    setCurrentUser(user);
    setAuthToken(token);
    navigate('/dashboard');
  };

  const handleLogout = async () => {
    try {
      if (authToken) {
        const res = await fetch('/api/auth/logout', {method:'POST',headers:{Authorization:'Bearer '+authToken}});
        if (!res.ok && res.status !== 401) throw new Error('Logout failed');
      }
    } catch {
      window.alert('Chưa thể hủy phiên trên máy chủ. Vui lòng thử đăng xuất lại khi có kết nối.');
      return;
    }
    localStorage.removeItem('driver_admin_token');
    localStorage.removeItem('driver_admin_user');
    localStorage.removeItem('driver_admin_login_time');
    setCurrentUser(null);
    setAuthToken('');
    navigate('/lookup');
  };

  useEffect(() => {
    const clearSession = () => {
      for (const key of ['driver_admin_token','driver_admin_user','driver_admin_login_time']) localStorage.removeItem(key);
      setCurrentUser(null); setAuthToken(''); navigate('/login');
    };
    window.addEventListener('auth-invalidated',clearSession);
    return () => window.removeEventListener('auth-invalidated',clearSession);
  }, [navigate]);

  // Route Guards:
  // 1. If not logged in, user can only access 'lookup' (or 'verify' with a valid token, or 'login' form).
  //    Accessing 'certificates', 'schools', or 'admin' when not logged in immediately redirects to '/lookup'.
  useEffect(() => {
    if (!authInitialized) return;
    if (!currentUser && (route.name === 'trainingPrograms' || route.name === 'transportUnits' || route.name === 'apiKeys' || route.name === 'dashboard' || route.name === 'certificates' || route.name === 'schools' || route.name === 'admin')) {
      navigate('/lookup');
    }
    // If logged in, visiting /login immediately redirects to /admin
    if (currentUser && route.name === 'login') {
      navigate('/dashboard');
    }
    if (currentUser && route.name === 'apiKeys' && currentUser.role !== 'SUPERADMIN') navigate('/dashboard');
  }, [authInitialized, currentUser, route.name, navigate]);

  // 2. Certificate route MUST have a valid token; otherwise redirect to '/lookup'.
  useEffect(() => {
    if (route.name === 'verify' && (!route.token || !route.token.trim())) {
      navigate('/lookup');
    }
  }, [route.name, route.token, navigate]);

  const currentToken = route.token || '';

  // User requested: "nếu trạng thái chưa đăng nhập không hiển thị sidebar (ở verify-certificate và lookup) và nút đăng nhập cán bộ trên trang lookup"
  const isPublicGuest = !currentUser && (route.name === 'lookup' || route.name === 'verify');
  const showSidebar = !isPublicGuest && Boolean(currentUser);
  const hasActiveSidebar = showSidebar && isSidebarOpen;

  return (
    <div className="app-shell min-h-screen flex flex-col bg-[#f3f8f4] text-slate-900 font-sans relative selection:bg-emerald-600 selection:text-white">
      <a href="#main-content" className="skip-link">Đến nội dung chính</a>
      {import.meta.env.VITE_DEMO_MODE==='true'&&<div className="demo-environment-note no-print" role="note"><strong>BẢN DEMO</strong><span>Dữ liệu mẫu riêng · Các thay đổi có thể được đặt lại khi dịch vụ khởi động lại.</span></div>}
      {/* Floating Security Banner when F12/Right click intercepted */}
      {securityNotice && (
        <div className="fixed top-4 right-4 z-50 max-w-sm bg-red-600 text-white p-3.5 rounded-2xl shadow-2xl flex items-start gap-3 animate-in slide-in-from-top-4 duration-200 border border-red-400">
          <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-amber-300 animate-pulse" />
          <div className="text-xs leading-relaxed flex-1">
            <strong className="font-bold block uppercase tracking-wide text-amber-200 mb-0.5">
              Cảnh Báo An Ninh:
            </strong>
            {securityNotice}
          </div>
          <button onClick={closeNotice} className="p-0.5 hover:bg-red-700 rounded-md">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      )}

      {/* Left Sidebar Layout (Only shown when user is authenticated) */}
      {showSidebar && (
        <Sidebar
          currentRoute={route.name}
          onNavigate={navigate}
          currentUser={currentUser}
          currentToken={currentToken}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          activeCertStatus={certStatusFilter}
          onSelectCertStatus={(st) => setCertStatusFilter(st)}
          activeSchoolStatus={schoolStatusFilter}
          onSelectSchoolStatus={(st) => setSchoolStatusFilter(st)}
        />
      )}

      {/* Main Right Area: Header + Body + Footer - Expands to full width when sidebar is hidden */}
      <div className={`app-content flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out ${hasActiveSidebar ? 'lg:pl-[272px]' : 'pl-0'}`}>
        {/* Main Header */}
        <Header
          currentRoute={route.name}
          onNavigate={navigate}
          currentUser={currentUser}
          onLogout={handleLogout}
          currentToken={currentToken}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          showSidebarToggle={showSidebar}
        />

        {/* Main Content Area */}
        <main id="main-content" className={`app-main flex-1 ${currentUser ? 'workspace-panels' : 'public-main'}`}>

          {route.name === 'dashboard' && currentUser && <Dashboard currentUser={currentUser} token={authToken} onNavigate={navigate} onViewCertificates={(status) => {setCertStatusFilter(status);navigate('/certificates');}} />}
          {route.name === 'apiKeys' && currentUser?.role === 'SUPERADMIN' && <ApiKeyManagement token={authToken} />}
          {route.name === 'trainingPrograms' && currentUser && <CatalogManagement key="programs" kind="training-programs" token={authToken} currentUser={currentUser} />}
          {route.name === 'transportUnits' && currentUser && <CatalogManagement key="units" kind="transport-units" token={authToken} currentUser={currentUser} />}
          
          {/* SUB 1: /verify-certificate/:token */}
          {route.name === 'verify' && currentToken && (
            <CertificateVerificationView
              initialToken={currentToken}
              onOpenCardModal={(cert) => setSelectedCardCert(cert)}
              onNavigateToken={(token) => {
                if (token === 'LOOKUP') {
                  navigate('/lookup');
                } else {
                  navigate(`/verify-certificate/${token}`);
                }
              }}
            />
          )}

          {/* SUB 2: /lookup */}
          {route.name === 'lookup' && (
            <PublicLookup
              onSelectCertificate={(token) => navigate(`/verify-certificate/${token}`)}
            />
          )}

          {/* SUB 3: /certificates (Module Học viên & GCN tách riêng - Yêu cầu đăng nhập) */}
          {route.name === 'certificates' && currentUser && (
            <Suspense fallback={<p>Đang tải quản lý chứng nhận...</p>}><CertificateManagement
              currentUser={currentUser}
              token={authToken}
              onViewCertificate={(token) => navigate(`/verify-certificate/${token}`)}
              onNavigateLogin={() => navigate('/login')}
              initialStatusFilter={certStatusFilter}
              onStatusFilterChange={(st) => setCertStatusFilter(st)}
            /></Suspense>
          )}

          {/* SUB 4: /schools (Danh mục cơ sở đào tạo - Yêu cầu đăng nhập) */}
          {route.name === 'schools' && currentUser && (
            <SchoolDirectory
              currentUser={currentUser}
              token={authToken}
              onSelectSchoolSample={(token) => navigate(`/verify-certificate/${token}`)}
              onNavigateLookup={() => navigate('/lookup')}
              initialStatusFilter={schoolStatusFilter}
              onStatusFilterChange={(st) => setSchoolStatusFilter(st)}
            />
          )}

        {/* SUB 5: /admin & /admin/security (Quản lý hệ thống cán bộ khi đã đăng nhập) */}
        {route.name === 'admin' && currentUser && (
          <AdminPortal
            currentUser={currentUser}
            token={authToken}
            subTab={route.loginSubTab || 'users'}
            onSubTabChange={(sub) => navigate(sub === 'security' ? '/admin/security' : '/admin')}
            onNavigateCertificates={() => navigate('/certificates')}
          />
        )}

        {/* SUB 6: /login (Đăng nhập cán bộ) */}
        {route.name === 'login' && (
          currentUser ? (
            <AdminPortal
              currentUser={currentUser}
              token={authToken}
              subTab={route.loginSubTab || 'users'}
              onSubTabChange={(sub) => navigate(sub === 'security' ? '/admin/security' : '/admin')}
              onNavigateCertificates={() => navigate('/certificates')}
            />
          ) : (
            <StaffLogin onLoginSuccess={handleLoginSuccess} onBack={() => navigate('/lookup')} />
          )
        )}
      </main>

      {/* Footer */}
      <Footer onNavigate={navigate} currentUser={currentUser} />
      </div>

      {/* Modals */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      <DigitalCertificateCardModal
        cert={selectedCardCert}
        onClose={() => setSelectedCardCert(null)}
      />

      <SecurityAlertModal
        isOpen={showDevToolsAlert}
        onClose={() => setShowDevToolsAlert(false)}
      />
    </div>
  );
}
