import React, { useState } from 'react';
import { Project, KPIWidget } from '../types';
import { 
  Sliders, 
  X, 
  Eye, 
  EyeOff, 
  ArrowUp, 
  ArrowDown, 
  Plus, 
  Check, 
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { DEFAULT_KPI_WIDGETS } from '../data/initialData';

interface WidgetCustomizerModalProps {
  project: Project;
  onClose: () => void;
  onUpdateWidgets: (widgets: KPIWidget[]) => void;
}

export const WidgetCustomizerModal: React.FC<WidgetCustomizerModalProps> = ({
  project,
  onClose,
  onUpdateWidgets,
}) => {
  const [widgets, setWidgets] = useState<KPIWidget[]>(
    project.kpiWidgets && project.kpiWidgets.length > 0 ? [...project.kpiWidgets] : [...DEFAULT_KPI_WIDGETS]
  );

  const handleToggleVisibility = (id: string) => {
    setWidgets(widgets.map((w) => (w.id === id ? { ...w, isVisible: !w.isVisible } : w)));
  };

  const handleMove = (index: number, direction: 'UP' | 'DOWN') => {
    const newWidgets = [...widgets];
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newWidgets.length) return;

    const temp = newWidgets[index];
    newWidgets[index] = newWidgets[targetIndex];
    newWidgets[targetIndex] = temp;

    // update order property
    const updated = newWidgets.map((w, idx) => ({ ...w, order: idx + 1 }));
    setWidgets(updated);
  };

  const handleUpdateThreshold = (id: string, field: 'greenMin' | 'amberMin' | 'target', value: number) => {
    setWidgets(
      widgets.map((w) => {
        if (w.id === id) {
          return {
            ...w,
            thresholds: {
              ...w.thresholds,
              [field]: value,
            },
          };
        }
        return w;
      })
    );
  };

  const handleResetDefaults = () => {
    setWidgets([...DEFAULT_KPI_WIDGETS]);
  };

  const handleSave = () => {
    onUpdateWidgets(widgets);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[85vh] overflow-hidden">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-100 text-indigo-700">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Personnaliser le Tableau de Bord KPI
              </h2>
              <p className="text-xs text-slate-500">
                Activez, ordonnez et configurez les seuils d’alerte de vos indicateurs
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Widgets List */}
        <div className="p-6 overflow-y-auto flex-1 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Widgets & Indicateurs ({widgets.filter((w) => w.isVisible).length} actifs sur {widgets.length})
            </span>
            <button
              onClick={handleResetDefaults}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Rétablir par défaut</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {widgets.map((widget, index) => (
              <div
                key={widget.id}
                className={`p-3.5 rounded-2xl border transition-all ${
                  widget.isVisible
                    ? 'bg-white border-slate-200 shadow-2xs'
                    : 'bg-slate-50 border-slate-200 opacity-50'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  
                  {/* Toggle & Title */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleToggleVisibility(widget.id)}
                      className={`p-2 rounded-xl transition-colors cursor-pointer ${
                        widget.isVisible
                          ? 'bg-indigo-50 text-indigo-600'
                          : 'bg-slate-200 text-slate-400'
                      }`}
                      title={widget.isVisible ? 'Masquer ce widget' : 'Afficher ce widget'}
                    >
                      {widget.isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>

                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{widget.title}</h4>
                      {widget.description && (
                        <p className="text-[11px] text-slate-500 mt-0.5">{widget.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Order & Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleMove(index, 'UP')}
                      disabled={index === 0}
                      className="p-1 text-slate-400 hover:text-slate-800 disabled:opacity-20 rounded"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleMove(index, 'DOWN')}
                      disabled={index === widgets.length - 1}
                      className="p-1 text-slate-400 hover:text-slate-800 disabled:opacity-20 rounded"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Optional Thresholds configuration */}
                {widget.thresholds && widget.isVisible && (
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center gap-3 text-xs">
                    <span className="text-[11px] font-bold text-slate-500">Seuils :</span>
                    
                    {widget.thresholds.greenMin !== undefined && (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-emerald-600 font-bold">🟢 Vert ≥</span>
                        <input
                          type="number"
                          step="0.05"
                          value={widget.thresholds.greenMin}
                          onChange={(e) => handleUpdateThreshold(widget.id, 'greenMin', Number(e.target.value))}
                          className="w-16 text-xs p-1 bg-slate-50 border border-slate-200 rounded font-semibold text-center"
                        />
                      </div>
                    )}

                    {widget.thresholds.amberMin !== undefined && (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-amber-600 font-bold">🟡 Ambre ≥</span>
                        <input
                          type="number"
                          step="0.05"
                          value={widget.thresholds.amberMin}
                          onChange={(e) => handleUpdateThreshold(widget.id, 'amberMin', Number(e.target.value))}
                          className="w-16 text-xs p-1 bg-slate-50 border border-slate-200 rounded font-semibold text-center"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            Enregistrer la Configuration
          </button>
        </div>

      </div>
    </div>
  );
};
