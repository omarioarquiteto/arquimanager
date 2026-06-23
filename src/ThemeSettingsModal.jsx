import React, { useState, useRef } from 'react';
import { X, Check, Palette, Monitor, Upload, Droplets } from 'lucide-react';
import { useTheme, BACKGROUNDS } from './ThemeContext';

export default function ThemeSettingsModal({ onClose }) {
  const { 
    theme, setTheme, 
    backgroundId, setBackground, 
    customBackground, setCustomColor, setCustomImage, clearCustomBackground 
  } = useTheme();

  const [activeTab, setActiveTab] = useState('tema');
  const [customColor, setCustomColorLocal] = useState(customBackground?.type === 'color' ? customBackground.value : '#1e293b');
  const fileInputRef = useRef(null);

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('A imagem deve ter no máximo 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCustomImage(ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  const isLiquid = theme === 'liquid';

  return (
    <div className={`fixed inset-0 flex items-center justify-center p-4 z-[80] ${isLiquid ? 'liquid-modal-backdrop' : 'bg-slate-900/70 backdrop-blur-sm'}`}>
      <div className={`w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 ${
        isLiquid 
          ? 'liquid-modal rounded-2xl' 
          : 'bg-white rounded-2xl shadow-2xl'
      }`}>
        
        {/* Header */}
        <div className={`p-4 flex justify-between items-center shrink-0 ${
          isLiquid
            ? 'liquid-modal-header'
            : 'bg-[#1e5aa0] text-white'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isLiquid ? 'bg-white/10' : 'bg-white/20'}`}>
              <Palette size={20} className="text-white" />
            </div>
            <div>
              <h2 className="font-bold text-lg uppercase tracking-wide text-white">Aparência</h2>
              <p className={`text-xs font-medium ${isLiquid ? 'text-white/50' : 'text-blue-200'}`}>Personalize o visual do seu ArquiManager</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <X size={20} className="text-white" />
          </button>
        </div>

        {/* Tabs */}
        <div className={`flex shrink-0 border-b ${
          isLiquid 
            ? 'border-white/10 bg-white/[0.02]' 
            : 'border-slate-200 bg-slate-50'
        }`}>
          {[
            { id: 'tema', label: 'Tema', icon: <Monitor size={14} /> },
            { id: 'fundo', label: 'Plano de Fundo', icon: <Palette size={14} /> },
          ].map(tab => (
            <button 
              key={tab.id} 
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 font-bold text-xs uppercase tracking-wide border-b-2 transition-all ${
                activeTab === tab.id
                  ? isLiquid 
                    ? 'border-blue-400 text-blue-300'
                    : 'border-[#1e5aa0] text-[#1e5aa0]'
                  : isLiquid
                    ? 'border-transparent text-white/40 hover:text-white/60'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {/* === TAB: TEMA === */}
          {activeTab === 'tema' && (
            <div className="space-y-6">
              <p className={`text-sm font-medium ${isLiquid ? 'text-white/60' : 'text-slate-500'}`}>
                Escolha o estilo visual da interface.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Classic Theme Card */}
                <button
                  onClick={() => setTheme('classic')}
                  className={`relative p-5 rounded-xl border-2 text-left transition-all group ${
                    theme === 'classic'
                      ? isLiquid
                        ? 'border-blue-400 bg-white/10'
                        : 'border-[#1e5aa0] bg-blue-50'
                      : isLiquid
                        ? 'border-white/10 hover:border-white/20 bg-white/[0.03] hover:bg-white/[0.06]'
                        : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50'
                  }`}
                >
                  {theme === 'classic' && (
                    <div className={`absolute top-3 right-3 p-1 rounded-full ${isLiquid ? 'bg-blue-400' : 'bg-[#1e5aa0]'}`}>
                      <Check size={14} className="text-white" />
                    </div>
                  )}
                  
                  {/* Preview */}
                  <div className="w-full h-24 rounded-lg mb-4 overflow-hidden border border-slate-200 bg-slate-50">
                    <div className="flex h-full">
                      <div className="w-12 bg-slate-800 flex flex-col items-center pt-2 gap-1">
                        <div className="w-6 h-1 bg-blue-500 rounded"></div>
                        <div className="w-6 h-1 bg-slate-600 rounded"></div>
                        <div className="w-6 h-1 bg-slate-600 rounded"></div>
                      </div>
                      <div className="flex-1 p-2 bg-slate-100">
                        <div className="w-full h-4 bg-blue-500 rounded mb-1"></div>
                        <div className="grid grid-cols-3 gap-1">
                          <div className="h-6 bg-white rounded border border-slate-200"></div>
                          <div className="h-6 bg-white rounded border border-slate-200"></div>
                          <div className="h-6 bg-white rounded border border-slate-200"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <h3 className={`font-black uppercase text-sm ${isLiquid ? 'text-white' : 'text-slate-800'}`}>Classic</h3>
                  <p className={`text-xs mt-1 ${isLiquid ? 'text-white/40' : 'text-slate-500'}`}>
                    Interface limpa e profissional com cores sólidas
                  </p>
                </button>

                {/* Liquid Theme Card */}
                <button
                  onClick={() => setTheme('liquid')}
                  className={`relative p-5 rounded-xl border-2 text-left transition-all group ${
                    theme === 'liquid'
                      ? isLiquid
                        ? 'border-blue-400 bg-white/10'
                        : 'border-[#1e5aa0] bg-blue-50'
                      : isLiquid
                        ? 'border-white/10 hover:border-white/20 bg-white/[0.03] hover:bg-white/[0.06]'
                        : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50'
                  }`}
                >
                  {theme === 'liquid' && (
                    <div className={`absolute top-3 right-3 p-1 rounded-full ${isLiquid ? 'bg-blue-400' : 'bg-[#1e5aa0]'}`}>
                      <Check size={14} className="text-white" />
                    </div>
                  )}
                  
                  {/* Preview */}
                  <div className="w-full h-24 rounded-lg mb-4 overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f172a, #1e1b4b, #312e81)' }}>
                    <div className="flex h-full">
                      <div className="w-12 flex flex-col items-center pt-2 gap-1" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)' }}>
                        <div className="w-6 h-1 rounded" style={{ background: 'rgba(96,165,250,0.5)' }}></div>
                        <div className="w-6 h-1 rounded" style={{ background: 'rgba(255,255,255,0.15)' }}></div>
                        <div className="w-6 h-1 rounded" style={{ background: 'rgba(255,255,255,0.15)' }}></div>
                      </div>
                      <div className="flex-1 p-2">
                        <div className="w-full h-4 rounded mb-1" style={{ background: 'linear-gradient(90deg, rgba(96,165,250,0.2), rgba(139,92,246,0.2))' }}></div>
                        <div className="grid grid-cols-3 gap-1">
                          <div className="h-6 rounded" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}></div>
                          <div className="h-6 rounded" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}></div>
                          <div className="h-6 rounded" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <h3 className={`font-black uppercase text-sm flex items-center gap-2 ${isLiquid ? 'text-white' : 'text-slate-800'}`}>
                    <Droplets size={16} className="text-blue-400" /> Liquid
                  </h3>
                  <p className={`text-xs mt-1 ${isLiquid ? 'text-white/40' : 'text-slate-500'}`}>
                    Interface minimalista, nítida e translúcida
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* === TAB: PLANO DE FUNDO === */}
          {activeTab === 'fundo' && (
            <div className="space-y-6">
              <p className={`text-sm font-medium ${isLiquid ? 'text-white/60' : 'text-slate-500'}`}>
                Escolha um plano de fundo ou use o seu próprio.
              </p>

              {/* Preset Backgrounds */}
              <div>
                <h4 className={`text-xs font-black uppercase tracking-wide mb-3 ${isLiquid ? 'text-white/50' : 'text-slate-500'}`}>
                  Gradientes Predefinidos
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {BACKGROUNDS.map(bg => {
                    const isSelected = !customBackground && backgroundId === bg.id;
                    return (
                      <button
                        key={bg.id}
                        onClick={() => { clearCustomBackground(); setBackground(bg.id); }}
                        className={`relative h-20 rounded-xl overflow-hidden border-2 transition-all group hover:scale-[1.02] ${
                          isSelected
                            ? 'border-blue-400 shadow-lg shadow-blue-500/20 ring-2 ring-blue-400/30'
                            : isLiquid 
                              ? 'border-white/10 hover:border-white/25'
                              : 'border-slate-200 hover:border-slate-400'
                        }`}
                        style={{ background: bg.value }}
                      >
                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5 bg-blue-400 p-0.5 rounded-full shadow-lg">
                            <Check size={10} className="text-white" />
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/60 to-transparent">
                          <span className="text-[9px] font-bold text-white uppercase tracking-wider">{bg.name}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Color */}
              <div>
                <h4 className={`text-xs font-black uppercase tracking-wide mb-3 ${isLiquid ? 'text-white/50' : 'text-slate-500'}`}>
                  Cor Sólida
                </h4>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <input
                      type="color"
                      value={customColor}
                      onChange={(e) => setCustomColorLocal(e.target.value)}
                      className="w-12 h-12 rounded-lg cursor-pointer border-2 border-slate-300"
                      style={{ padding: 0 }}
                    />
                  </div>
                  <button
                    onClick={() => setCustomColor(customColor)}
                    className={`px-4 py-2.5 rounded-lg font-bold text-xs uppercase transition-all ${
                      isLiquid
                        ? 'bg-white/10 text-white border border-white/15 hover:bg-white/15'
                        : 'bg-[#1e5aa0] text-white hover:bg-[#154278]'
                    }`}
                  >
                    Aplicar Cor
                  </button>
                  {customBackground?.type === 'color' && (
                    <span className={`text-xs font-bold flex items-center gap-1 ${isLiquid ? 'text-blue-300' : 'text-blue-600'}`}>
                      <Check size={14} /> Ativo
                    </span>
                  )}
                </div>
              </div>

              {/* Custom Image */}
              <div>
                <h4 className={`text-xs font-black uppercase tracking-wide mb-3 ${isLiquid ? 'text-white/50' : 'text-slate-500'}`}>
                  Imagem Personalizada
                </h4>
                <div className="flex items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-xs uppercase transition-all ${
                      isLiquid
                        ? 'bg-white/10 text-white border border-white/15 hover:bg-white/15'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
                    }`}
                  >
                    <Upload size={14} /> Carregar Imagem
                  </button>
                  {customBackground?.type === 'image' && (
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-10 h-10 rounded-lg border border-slate-300 bg-cover bg-center"
                        style={{ backgroundImage: `url(${customBackground.value})` }}
                      ></div>
                      <span className={`text-xs font-bold flex items-center gap-1 ${isLiquid ? 'text-blue-300' : 'text-blue-600'}`}>
                        <Check size={14} /> Imagem ativa
                      </span>
                    </div>
                  )}
                </div>
                <p className={`text-[10px] mt-2 ${isLiquid ? 'text-white/30' : 'text-slate-400'}`}>
                  Formatos aceitos: JPG, PNG, WebP. Máximo 2MB.
                </p>
              </div>

              {/* Reset */}
              {customBackground && (
                <div className={`pt-4 border-t ${isLiquid ? 'border-white/10' : 'border-slate-200'}`}>
                  <button
                    onClick={clearCustomBackground}
                    className={`text-xs font-bold uppercase ${isLiquid ? 'text-red-400 hover:text-red-300' : 'text-red-500 hover:text-red-600'} transition-colors`}
                  >
                    Remover fundo personalizado e voltar ao predefinido
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`p-4 border-t shrink-0 flex justify-end ${
          isLiquid 
            ? 'border-white/10 bg-white/[0.02]' 
            : 'border-slate-200 bg-slate-50'
        }`}>
          <button 
            onClick={onClose}
            className={`px-6 py-2.5 rounded-lg font-bold uppercase text-xs transition-all ${
              isLiquid
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30'
                : 'bg-[#1e5aa0] text-white hover:bg-[#154278]'
            }`}
          >
            Concluído
          </button>
        </div>
      </div>
    </div>
  );
}
