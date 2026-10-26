import React from 'react';
import { ShieldAlert } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const SecurityAlertModal: React.FC<Props> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div role="dialog" aria-modal="true" aria-labelledby="security-alert-title" aria-describedby="security-alert-description" className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-red-200">
        <div className="bg-red-700 text-white p-5 text-center">
          <ShieldAlert className="w-9 h-9 mx-auto mb-2" />
          <h3 id="security-alert-title" className="text-base font-bold uppercase">Cảnh Báo An Ninh Hệ Thống</h3>
        </div>
        <div className="p-6 text-center">
          <p id="security-alert-description" className="text-sm text-slate-800 leading-relaxed mb-5">Hệ thống vô hiệu hoá các chức năng của DevTools.</p>
          <button type="button" onClick={onClose} className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-colors">Đã hiểu</button>
        </div>
      </div>
    </div>
  );
};
