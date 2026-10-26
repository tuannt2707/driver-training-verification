import { useEffect, useState } from 'react';
import { SecuritySettings } from '../types';

export function useSecurityShield(initialSettings?: Partial<SecuritySettings>) {
  const [isDevToolsOpen, setIsDevToolsOpen] = useState(false);
  const [securityNotice, setSecurityNotice] = useState<string | null>(null);

  useEffect(() => {
    let settings: SecuritySettings = {
      antiF12Enabled: true,
      disableRightClick: true,
      detectDevTools: true,
      maskSensitiveDataPublic: true,
      requireTwoFactorLookup: false,
      watermarkText: 'HỆ THỐNG CÔNG BỐ & XÁC THỰC LÁI XE',
      ...initialSettings
    };

    // Fetch live settings from server
    const fetchSettings = () => fetch('/api/public/security-config')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          settings = { ...settings, ...data.data };
        }
      })
      .catch(() => {});

    void fetchSettings();
    const settingsInterval = setInterval(fetchSettings, 30_000);

    // 1. Keyboard Shortcut Blocking
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!settings.antiF12Enabled) return;

      const isF12 = e.key === 'F12' || e.keyCode === 123;
      const isDevToolsCombo = (e.ctrlKey || e.metaKey) && (
        (e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) ||
        (e.key === 'U' || e.key === 'u') ||
        (e.key === 'S' || e.key === 's')
      );

      if (isF12 || isDevToolsCombo) {
        e.preventDefault();
        e.stopPropagation();
        
        setSecurityNotice('Chế độ bảo mật thông tin học viên đang bật. Thao tác xem mã nguồn (F12/DevTools) bị hạn chế.');
        setTimeout(() => setSecurityNotice(null), 4000);

        // Notify server
        fetch('/api/security/log-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'DEVTOOLS_KEY_BLOCKED',
            target: isF12 ? 'F12' : 'SHORTCUT_COMBO',
            details: { key: e.key, ctrl: e.ctrlKey, shift: e.shiftKey }
          })
        }).catch(() => {});

        return false;
      }
    };

    // 2. Right-Click Blocking
    const handleContextMenu = (e: MouseEvent) => {
      if (!settings.disableRightClick) return;
      e.preventDefault();
      
      setSecurityNotice('Chuột phải đã bị vô hiệu hóa để bảo vệ an toàn dữ liệu và quyền riêng tư học viên.');
      setTimeout(() => setSecurityNotice(null), 3500);

      fetch('/api/security/log-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RIGHT_CLICK_BLOCKED', target: 'PAGE_CONTEXT' })
      }).catch(() => {});

      return false;
    };

    // 3. DevTools Open Detection via resize threshold & timing
    let checkInterval: any = null;
    let wasOpen = false;
    {
      checkInterval = setInterval(() => {
        const widthThreshold = window.outerWidth - window.innerWidth > 160;
        const heightThreshold = window.outerHeight - window.innerHeight > 160;

        if (settings.detectDevTools && (widthThreshold || heightThreshold)) {
          if (!wasOpen) {
            wasOpen = true;
            setIsDevToolsOpen(true);
            fetch('/api/security/log-event', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'DEVTOOLS_DETECTED_OPEN',
                target: 'VIEWPORT_DELTA',
                details: {
                  deltaW: window.outerWidth - window.innerWidth,
                  deltaH: window.outerHeight - window.innerHeight
                }
              })
            }).catch(() => {});
          }
        } else {
          if (wasOpen) {
            wasOpen = false;
            setIsDevToolsOpen(false);
          }
        }
      }, 1000);
    }

    // 4. Anti-selection for sensitive fields
    const handleCopy = (e: ClipboardEvent) => {
      const selection = window.getSelection()?.toString();
      // If user is trying to bulk scrape
      if (selection && selection.length > 500) {
        e.preventDefault();
        setSecurityNotice('Chức năng sao chép hàng loạt bị hạn chế nhằm chống cào dữ liệu.');
        setTimeout(() => setSecurityNotice(null), 3000);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('copy', handleCopy);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('copy', handleCopy);
      if (checkInterval) clearInterval(checkInterval);
      clearInterval(settingsInterval);
    };
  }, [initialSettings]);

  return {
    isDevToolsOpen,
    securityNotice,
    closeNotice: () => setSecurityNotice(null)
  };
}
