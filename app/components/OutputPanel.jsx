'use client';

/**
 * OutputPanel — exibe saída de comandos SSH em estilo terminal
 */
export default function OutputPanel({ isOpen, title, output, loading, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      {/* Panel */}
      <div className="relative w-full sm:max-w-2xl bg-[var(--md-sys-color-surface)] rounded-t-[28px] sm:rounded-[28px] shadow-[var(--md-elevation-3)] flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <span className="text-sm font-mono text-[var(--md-sys-color-on-surface-variant)]">{title || 'terminal'}</span>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full hover:bg-black/5 flex items-center justify-center transition-colors text-[var(--md-sys-color-on-surface-variant)]"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>
        {/* Content */}
        <div className="p-6 font-mono text-sm text-gray-800 bg-[#F8F9FA] rounded-b-[28px] flex-1 overflow-y-auto whitespace-pre-wrap">
          {loading ? (
            <div className="flex items-center gap-2 text-[var(--md-sys-color-primary)] font-medium">
              <span className="animate-spin material-symbols-outlined text-base">autorenew</span>
              Processando...
            </div>
          ) : output ? (
            output
          ) : (
            <span className="text-gray-500">Sem saída.</span>
          )}
        </div>
      </div>
    </div>
  );
}
