import React, { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import { X, Award, ShieldCheck, Download, Check, ExternalLink, Printer } from 'lucide-react';
import { PublicCertificateView } from '../types';

interface Props {
  cert: PublicCertificateView | null;
  onClose: () => void;
}

export const DigitalCertificateCardModal: React.FC<Props> = ({ cert, onClose }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cert) {
      const verifyUrl = `${window.location.origin}/verify-certificate/${cert.qrToken}`;
      QRCode.toDataURL(verifyUrl, {
        width: 400,
        margin: 1,
        color: {
          dark: '#1e3a8a',
          light: '#ffffff'
        }
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('Error generating QR:', err));
    }
  }, [cert]);

  if (!cert) return null;

  const downloadQR = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `QR_${cert.certificateNumber}_${cert.fullName.replace(/\s+/g, '_')}.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-blue-700" />
            <span className="font-bold text-slate-800 text-sm">
              Thẻ Giấy Chứng Nhận Điện Tử & Mã QR Xác Thực
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Card Body */}
        <div className="p-6 space-y-6">
          {/* Digital Badge Layout */}
          <div
            ref={cardRef}
            className="relative rounded-2xl bg-gradient-to-br from-blue-900 via-indigo-900 to-slate-900 text-white p-6 shadow-xl border-2 border-amber-400/40 overflow-hidden"
          >
            {/* Background Seal Watermark */}
            <div className="absolute -right-8 -bottom-8 opacity-10 pointer-events-none">
              <Award className="w-64 h-64 text-white" />
            </div>

            {/* Top Bar of Card */}
            <div className="flex items-center justify-between pb-3 border-b border-white/20">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-400/20 border border-amber-400/50 flex items-center justify-center text-amber-300">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold tracking-widest text-amber-300">
                    SỞ XÂY DỰNG TP. HỒ CHÍ MINH
                  </div>
                  <div className="text-[11px] font-semibold text-white truncate max-w-[220px]">
                    {cert.schoolName}
                  </div>
                </div>
              </div>

              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-500/20 border border-emerald-400 text-emerald-300">
                Hợp Lệ
              </span>
            </div>

            {/* Middle Card with QR and Driver Info */}
            <div className="mt-4 flex items-center gap-4">
              {/* QR Code with Scan Border */}
              <div className="shrink-0 bg-white p-2 rounded-xl shadow-md border-2 border-amber-400/80">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="QR Code" className="w-24 h-24 sm:w-28 sm:h-28" />
                ) : (
                  <div className="w-24 h-24 sm:w-28 sm:h-28 bg-slate-100 flex items-center justify-center text-xs text-slate-400">
                    Đang tạo...
                  </div>
                )}
                <div className="text-[9px] font-bold text-center text-emerald-900 mt-1 uppercase">
                  Quét xác thực
                </div>
              </div>

              {/* Info Block */}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="text-[10px] uppercase font-bold text-emerald-200">
                  NGƯỜI LÁI XE ĐƯỢC ĐÀO TẠO
                </div>
                <div className="text-base sm:text-lg font-extrabold text-white leading-tight truncate">
                  {cert.fullName}
                </div>
                <div className="text-xs text-emerald-100 font-mono">
                  CCCD: {cert.cccd}
                </div>
                <div className="text-xs text-emerald-100 font-mono">
                  GPLX: {cert.licenseNumber} ({cert.licenseClass})
                </div>
                <div className="text-[11px] text-amber-300 font-bold font-mono pt-1">
                  Số GCN: {cert.certificateNumber}
                </div>
              </div>
            </div>

            {/* Bottom Card Bar */}
            <div className="mt-4 pt-3 border-t border-white/20 flex items-center justify-between text-[11px] text-blue-200">
              <div>
                Hiệu lực đến: <strong className="text-white font-mono">{cert.validUntil}</strong>
              </div>
              <div className="flex items-center gap-1 text-emerald-300 font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Chữ ký số hợp lệ</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              onClick={downloadQR}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs sm:text-sm font-semibold rounded-xl transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Tải file mã QR (.png)</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-xs transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>In thẻ học viên</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
