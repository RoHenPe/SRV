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
      <div className="relative bg-[var(--md-sys-color-surface)] shadow-[var(--md-elevation-3)] rounded-[28px] p-6 w-full max-w-sm animate-fade-in">
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${danger ? 'bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-error)]' : 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-primary)]'}`}>
            <span className="material-symbols-outlined icon-filled text-2xl">
              {danger ? 'warning' : 'help'}
            </span>
          </div>
          <div>
            <h3 className="text-xl font-medium google-sans text-[var(--md-sys-color-on-surface)]">{title}</h3>
            <p className="text-[var(--md-sys-color-on-surface-variant)] text-sm mt-2 leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-8">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 rounded-full text-sm font-medium text-[var(--md-sys-color-primary)] hover:bg-black/5 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className={`px-5 py-2.5 rounded-full font-medium text-sm text-white transition-all ${
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
