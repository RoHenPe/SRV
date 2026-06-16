'use client';

/**
 * OutputPanel — exibe saída de comandos SSH em estilo terminal
 */
export default function OutputPanel({ isOpen, title, output, loading, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onClose} />
      {/* Panel */}
      <div className="relative w-full sm:max-w-2xl bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] rounded-t-2xl sm:rounded-2xl shadow-[var(--md-elevation-3)] flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--md-sys-color-surface-variant)]">
          <span className="text-xs font-mono text-[var(--md-sys-color-on-surface-variant)]">{title || 'terminal'}</span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-black/5 flex items-center justify-center transition-colors text-[var(--md-sys-color-on-surface-variant)]"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
        {/* Content */}
        <div className="p-5 font-mono text-xs text-[var(--md-sys-color-on-surface)] bg-[var(--md-sys-color-background)] rounded-b-2xl flex-1 overflow-y-auto whitespace-pre-wrap">
          {loading ? (
            <div className="flex items-center gap-2 text-[var(--md-sys-color-primary)] font-medium">
              <span className="animate-spin material-symbols-outlined text-base">autorenew</span>
              Processando...
            </div>
          ) : output ? (
            output
          ) : (
            <span className="text-[var(--md-sys-color-on-surface-variant)]">Sem saída.</span>
          )}
        </div>
      </div>
    </div>
  );
}
