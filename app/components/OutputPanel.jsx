'use client';

/**
 * OutputPanel — exibe saída de comandos SSH em estilo terminal
 */
export default function OutputPanel({ isOpen, title, output, loading, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      {/* Panel */}
      <div className="relative w-full sm:max-w-2xl bg-gray-950 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-800 animate-modal-in">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500"></span>
            <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
            <span className="w-3 h-3 rounded-full bg-green-500"></span>
            <span className="ml-2 text-gray-400 text-sm font-mono">{title || 'terminal'}</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>
        {/* Content */}
        <div className="p-4 font-mono text-sm text-green-400 max-h-80 overflow-y-auto whitespace-pre-wrap">
          {loading ? (
            <div className="flex items-center gap-2 text-yellow-400">
              <span className="animate-spin material-symbols-outlined text-base">autorenew</span>
              Executando comando...
            </div>
          ) : output ? (
            output
          ) : (
            <span className="text-gray-600">Sem saída.</span>
          )}
        </div>
      </div>
    </div>
  );
}
