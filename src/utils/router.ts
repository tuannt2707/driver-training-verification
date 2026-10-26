import { useState, useEffect, useCallback } from 'react';

export type RouteName = 'trainingPrograms' | 'transportUnits' | 'apiKeys' | 'dashboard' | 'verify' | 'lookup' | 'certificates' | 'schools' | 'login' | 'admin';

export interface RouteState {
  path: string;
  name: RouteName;
  token?: string;
  loginSubTab?: 'users' | 'security';
}

export function parseRoute(pathname: string, search: string): RouteState {
  // If user entered with old query style (?token=...), automatically extract token
  const searchParams = new URLSearchParams(search);
  const queryToken = searchParams.get('token');

  const cleanPath = pathname.replace(/\/+$/, '') || '/';

  if (cleanPath === '/dashboard') return {path:'/dashboard', name:'dashboard'};
  if (cleanPath === '/training-programs') return {path:cleanPath,name:'trainingPrograms'};
  if (cleanPath === '/transport-units') return {path:cleanPath,name:'transportUnits'};
  if (cleanPath === '/admin/api-keys') return {path:'/admin/api-keys', name:'apiKeys'};

  // 1. /verify-certificate/:token
  const verifyMatch = cleanPath.match(/^\/verify-certificate(?:\/([a-zA-Z0-9_-]+))?$/i);
  if (verifyMatch) {
    const rawToken = verifyMatch[1] || queryToken || '';
    const token = rawToken.trim();
    if (token) {
      return {
        path: `/verify-certificate/${token}`,
        name: 'verify',
        token
      };
    } else {
      // Certificate route without token -> route directly to lookup!
      return {
        path: '/lookup',
        name: 'lookup'
      };
    }
  }

  // 2. /lookup (English canonical path for Tra cứu thông tin)
  if (cleanPath === '/lookup' || cleanPath === '/tra-cuu' || cleanPath === '/search') {
    return {
      path: '/lookup',
      name: 'lookup'
    };
  }

  // 3. /certificates (English canonical path for Học viên & Giấy chứng nhận - tách riêng)
  if (cleanPath === '/certificates' || cleanPath === '/hoc-vien' || cleanPath === '/gcn' || cleanPath === '/students') {
    return {
      path: '/certificates',
      name: 'certificates'
    };
  }

  // 4. /schools (English canonical path for Cơ sở đào tạo)
  if (cleanPath === '/schools' || cleanPath === '/co-so-dao-tao' || cleanPath === '/truong-dao-tao') {
    return {
      path: '/schools',
      name: 'schools'
    };
  }

  // 5. /admin (English canonical path for Cán bộ Quản trị Hệ thống khi đã đăng nhập)
  if (cleanPath.startsWith('/admin') || cleanPath.startsWith('/quan-ly')) {
    let loginSubTab: 'users' | 'security' = 'users';
    if (cleanPath.includes('security') || cleanPath.includes('bao-mat')) {
      loginSubTab = 'security';
      return {
        path: '/admin/security',
        name: 'admin',
        loginSubTab
      };
    }
    return {
      path: '/admin',
      name: 'admin',
      loginSubTab
    };
  }

  // 6. /login (Cổng đăng nhập cán bộ)
  if (cleanPath.startsWith('/login') || cleanPath === '/dang-nhap') {
    let loginSubTab: 'users' | 'security' = 'users';
    if (cleanPath.includes('security') || cleanPath.includes('bao-mat')) {
      loginSubTab = 'security';
      return {
        path: '/login/security',
        name: 'login',
        loginSubTab
      };
    }
    return {
      path: '/login',
      name: 'login',
      loginSubTab
    };
  }

  // Fallback for root '/' or query param:
  // If there's an explicit token query param, route to verify-certificate/:token
  if (queryToken && queryToken.trim()) {
    return {
      path: `/verify-certificate/${queryToken.trim()}`,
      name: 'verify',
      token: queryToken.trim()
    };
  }

  // All root or unmapped routes default strictly to /lookup
  return {
    path: '/lookup',
    name: 'lookup'
  };
}

export function useRouter() {
  const [route, setRoute] = useState<RouteState>(() =>
    parseRoute(window.location.pathname, window.location.search)
  );

  useEffect(() => {
    // If URL contains "?token=" or legacy path, cleanly rewrite to English canonical path without reload
    const currentPath = window.location.pathname;
    const currentSearch = window.location.search;
    const searchParams = new URLSearchParams(currentSearch);
    const queryToken = searchParams.get('token');

    let canonicalPath: string | null = null;
    if (queryToken && queryToken.trim()) {
      canonicalPath = `/verify-certificate/${queryToken.trim()}`;
    } else if (
      currentPath === '/' ||
      currentPath === '' ||
      currentPath === '/verify-certificate' ||
      currentPath === '/verify-certificate/'
    ) {
      canonicalPath = '/lookup';
    } else if (currentPath === '/tra-cuu' || currentPath === '/search') {
      canonicalPath = '/lookup';
    } else if (currentPath === '/co-so-dao-tao' || currentPath === '/truong-dao-tao') {
      canonicalPath = '/schools';
    } else if (currentPath === '/hoc-vien' || currentPath === '/gcn') {
      canonicalPath = '/certificates';
    } else if (currentPath === '/quan-ly/bao-mat') {
      canonicalPath = '/admin/security';
    } else if (currentPath === '/quan-ly') {
      canonicalPath = '/admin';
    } else if (currentPath === '/dang-nhap') {
      canonicalPath = '/login';
    }

    if (canonicalPath && canonicalPath !== currentPath) {
      window.history.replaceState(null, '', canonicalPath);
      setRoute(parseRoute(canonicalPath, ''));
    }

    const onPopState = () => {
      setRoute(parseRoute(window.location.pathname, window.location.search));
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((targetPath: string) => {
    // If target doesn't start with '/', normalize it
    const normalized = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
    
    // Prevent duplicate push if already on the same path
    if (window.location.pathname !== normalized) {
      window.history.pushState(null, '', normalized);
    }
    
    setRoute(parseRoute(normalized, ''));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return { route, navigate };
}
