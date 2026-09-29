import React, { useEffect, useRef, useState } from 'react';
import { Landmark, Link2, RefreshCw, ShieldCheck, Trash2, XCircle } from 'lucide-react';

const PLUGGY_SCRIPT = 'https://cdn.pluggy.ai/pluggy-connect/latest/pluggy-connect.js';

let pluggyScriptPromise = null;

const loadPluggySdk = () => {
  if (typeof window !== 'undefined' && window.PluggyConnect) {
    return Promise.resolve(window.PluggyConnect);
  }

  if (pluggyScriptPromise) return pluggyScriptPromise;

  pluggyScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-arquimanager-pluggy-connect]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.PluggyConnect));
      existing.addEventListener('error', () => reject(new Error('Não foi possível carregar o Pluggy Connect.')));
      return;
    }

    const script = document.createElement('script');
    script.src = PLUGGY_SCRIPT;
    script.async = true;
    script.dataset.arquimanagerPluggyConnect = 'true';
    script.onload = () => {
      if (window.PluggyConnect) resolve(window.PluggyConnect);
      else reject(new Error('O SDK Pluggy foi carregado, mas não disponibilizou o widget.'));
    };
    script.onerror = () => reject(new Error('Não foi possível carregar o Pluggy Connect.'));
    document.head.appendChild(script);
  });

  return pluggyScriptPromise;
};

export default function PluggyConnections({ appUser, connections = [], onSaveConnection, onSyncConnection, onClearConnection, busy = false }) {
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const widgetRef = useRef(null);

  useEffect(() => () => {
    try { widgetRef.current?.destroy?.(); } catch {}
    widgetRef.current = null;
  }, []);

  const requestToken = async (itemId = null) => {
    const response = await fetch('/.netlify/functions/pluggy-connect-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        itemId: itemId || undefined,
        clientUserId: appUser?.id ? `arquimanager:${appUser.id}` : undefined,
        avoidDuplicates: true,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.accessToken) {
      throw new Error(data.error || 'Não foi possível iniciar a conexão bancária.');
    }

    return data.accessToken;
  };

  const startConnection = async (existing = null) => {
    setError('');
    setBusyId(existing?.itemId || 'new');

    try {
      const PluggyConnect = await loadPluggySdk();
      const connectToken = await requestToken(existing?.itemId || null);

      try { widgetRef.current?.destroy?.(); } catch {}

      const widget = new PluggyConnect({
        connectToken,
        ...(existing?.itemId ? { updateItem: existing.itemId } : {}),
        language: 'pt',
        onOpen: () => setBusyId(''),
        onClose: () => {
          setBusyId('');
          widgetRef.current = null;
        },
        onSuccess: async (itemData) => {
          const item = itemData?.item || itemData;
          const itemId = item?.id;
          if (!itemId) {
            setError('A Pluggy concluiu a conexão, mas não retornou o itemId.');
            setBusyId('');
            return;
          }

          const connectionData = {
            itemId,
            connectorId: item.connector?.id || item.connectorId || null,
            connectorName: item.connector?.name || item.connectorName || 'Instituição financeira',
            status: item.status || 'UPDATED',
            clientUserId: item.clientUserId || (appUser?.id ? `arquimanager:${appUser.id}` : null),
            lastConnectedAt: new Date().toISOString(),
          };

          await onSaveConnection(connectionData);
          if (onSyncConnection) await onSyncConnection(connectionData);

          setBusyId('');
          widgetRef.current = null;
        },
        onError: (widgetError) => {
          setError(widgetError?.message || 'A Pluggy não conseguiu concluir a conexão.');
          setBusyId('');
        },
      });

      widgetRef.current = widget;
      widget.init();
    } catch (err) {
      setBusyId('');
      setError(err.message || 'Não foi possível iniciar a conexão.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h4 className="font-black text-xl text-slate-800">Conexões bancárias</h4>
          <p className="text-xs text-slate-400 mt-1">
            Conecte bancos e cartões pelo fluxo seguro da Pluggy. O ArquiManager recebe a referência da conexão; suas credenciais bancárias não ficam armazenadas aqui.
          </p>
        </div>
        <button
          onClick={() => startConnection()}
          disabled={busyId !== ''}
          className="bg-[#1e5aa0] text-white px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 disabled:opacity-50"
        >
          <Link2 size={16}/>
          {busyId === 'new' ? 'Abrindo...' : 'Conectar banco'}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs font-bold">
          <XCircle size={17} className="shrink-0 mt-0.5"/>
          <span>{error}</span>
        </div>
      )}

      {!connections.length ? (
        <div className="p-8 border border-dashed border-slate-200 rounded-2xl bg-slate-50 text-center">
          <Landmark size={30} className="mx-auto text-slate-300 mb-3"/>
          <p className="font-black text-slate-600">Nenhum banco conectado</p>
          <p className="text-xs text-slate-400 mt-1">A primeira conexão será usada como origem das contas e movimentações bancárias.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {connections.map(connection => (
            <div key={connection.id} className="border border-slate-200 rounded-2xl p-4 bg-white shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-2 rounded-xl bg-blue-50 text-[#1e5aa0]"><Landmark size={18}/></div>
                  <div className="min-w-0">
                    <p className="font-black text-slate-800 truncate">{connection.connectorName || 'Instituição financeira'}</p>
                    <p className="text-[10px] text-slate-400 truncate">{connection.itemId}</p>
                  </div>
                </div>
                <span className="text-[9px] font-black uppercase px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700">
                  {connection.status || 'conectado'}
                </span>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold text-slate-400">
                  {connection.lastConnectedAt ? new Date(connection.lastConnectedAt).toLocaleDateString('pt-BR') : 'Sem data'}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => onSyncConnection?.(connection)}
                    disabled={busyId !== '' || busy}
                    className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-black flex items-center gap-1 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <RefreshCw size={14}/>
                    Sincronizar
                  </button>
                  <button
                    onClick={() => startConnection(connection)}
                    disabled={busyId !== '' || busy}
                    className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-black flex items-center gap-1 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Link2 size={14}/>
                    Reconectar
                  </button>
                  <button
                    onClick={() => onClearConnection?.(connection)}
                    disabled={busyId !== '' || busy}
                    className="px-2.5 py-2 rounded-xl border border-red-200 text-red-600 text-xs font-black flex items-center justify-center gap-1 hover:bg-red-50 disabled:opacity-50"
                    title="Limpar todos os dados sincronizados deste banco"
                  >
                    <Trash2 size={14}/>
                  </button>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 text-[10px] text-slate-400 font-medium">
                <ShieldCheck size={13} className="text-emerald-500"/>
                Credenciais tratadas pelo Pluggy Connect
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
