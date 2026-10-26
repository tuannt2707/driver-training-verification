import { PublicCertificateDetails } from './PublicCertificateDetails';
import { apiFetch } from '../utils/api';
import React, { useState, useEffect, useCallback } from 'react';
import { XCircle, RefreshCw, Clock } from 'lucide-react';
import { PublicCertificateView } from '../types';

interface Props {
  initialToken?: string;
  onOpenCardModal?: (cert: PublicCertificateView) => void;
  onNavigateToken?: (token: string) => void;
}

export const CertificateVerificationView: React.FC<Props> = ({
  initialToken = '',
  onOpenCardModal: _onOpenCardModal,
  onNavigateToken
}) => {
  const [activeToken, setActiveToken] = useState(initialToken);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cert, setCert] = useState<PublicCertificateView | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync token from prop
  useEffect(() => {
    if (initialToken && initialToken !== activeToken) {
      setActiveToken(initialToken);
    }
  }, [initialToken]);

  const fetchCertificate = useCallback(async (token: string, isRefresh = false) => {
    if (!token) {
      setError('Vui lòng cung cấp mã xác thực chứng nhận.');
      setLoading(false);
      return;
    }

    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await apiFetch(`/api/public/verify-certificate/${encodeURIComponent(token.trim())}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'Mã xác thực không hợp lệ hoặc Giấy chứng nhận không tồn tại.');
        setCert(null);
      } else {
        setCert(data.data);
      }
    } catch (err: any) {
      setError('Không thể kết nối đến máy chủ xác thực. Vui lòng thử lại sau.');
      setCert(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchCertificate(activeToken);
  }, [activeToken, fetchCertificate]);

  return (
    <div className="certificate-view space-y-4 sm:space-y-6 max-w-4xl mx-auto">
      {/* Loading State */}
      {loading && (
        <div className="bg-white rounded-2xl border border-emerald-100 p-10 text-center shadow-xs">
          <RefreshCw className="w-8 h-8 animate-spin text-emerald-600 mx-auto" />
          <h3 className="mt-3 text-base font-semibold text-slate-800">Đang truy vấn dữ liệu chứng chỉ an toàn...</h3>
          <p className="text-xs text-slate-500 mt-1">Đang đối soát chứng chỉ điện tử từ hệ thống.</p>
        </div>
      )}

      {/* Error / Not Found State */}
      {!loading && error && (
        <div className="bg-white rounded-2xl border border-red-200 p-8 text-center shadow-xs">
          <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <XCircle className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Mã QR hoặc Chứng Nhận Không Hợp Lệ</h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto mt-2">{error}</p>
          <p className="text-xs text-slate-400 max-w-md mx-auto mt-4">
            Vui lòng quét lại mã QR trên Giấy chứng nhận hoặc tra cứu thông tin học viên theo số CCCD/GPLX.
          </p>
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => onNavigateToken ? onNavigateToken('LOOKUP') : (window.location.href = '/lookup')}
              className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-colors inline-flex items-center gap-2 shadow-xs"
            >
              <span>Về Trang Tra Cứu Thông Tin Học Viên</span>
            </button>
          </div>
        </div>
      )}

      {/* Verified Certificate View - FULL VERTICAL STACK FOR MOBILE / TABLET / DESKTOP */}
      {!loading && cert && (
        <div className="space-y-4">
          <PublicCertificateDetails cert={cert} />

          {/* Action Footer Bar (Mobile Optimized) */}
          <div className="no-print bg-white rounded-2xl border border-emerald-100 p-3.5 sm:p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-1.5 self-start sm:self-center">
              <Clock className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Dữ liệu cập nhật lúc: <strong>{new Date(cert.verifiedAt).toLocaleString('vi-VN')}</strong></span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => fetchCertificate(activeToken, true)}
                disabled={refreshing}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors font-semibold"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                <span>{refreshing ? 'Đang làm mới...' : 'Làm mới'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
