'use client';

/**
 * Modal de confirmação — exibido antes de ações destrutivas (desligar, reiniciar)
 */
export default function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, danger = true }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      {/* Card */}
      <div className="relative bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] shadow-[var(--md-elevation-3)] rounded-2xl p-5 w-full max-w-sm animate-fade-in">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${danger ? 'bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-error)]' : 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-primary)]'}`}>
            <span className="material-symbols-outlined icon-filled text-xl">
              {danger ? 'warning' : 'help'}
            </span>
          </div>
          <div>
            <h3 className="text-base font-semibold google-sans text-[var(--md-sys-color-on-surface)]">{title}</h3>
            <p className="text-[var(--md-sys-color-on-surface-variant)] text-xs mt-1 leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--md-sys-color-primary)] hover:bg-black/5 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-xl font-semibold text-xs text-white transition-all ${
              danger
                ? 'bg-[var(--md-sys-color-error)] hover:opacity-90'
                : 'bg-[var(--md-sys-color-primary)] hover:opacity-90'
            }`}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
