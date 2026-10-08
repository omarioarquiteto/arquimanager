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

export default function PluggyConnections({ appUser, connections = [], onSaveConnection, onSyncConnection, onClearConnection, onDeleteConnection, busy = false }) {
  const [busyId, setBusyId] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState('');
  const [syncProgress, setSyncProgress] = useState(null);
  const [displayProgress, setDisplayProgress] = useState(0);
  const widgetRef = useRef(null);

  const appClientUserId = appUser?.id ? `arquimanager:${appUser.id}` : '';

  const connectionDataFromItem = (item) => ({
    itemId: item?.id,
    connectorId: item?.connector?.id || item?.connectorId || null,
    connectorName: item?.connector?.name || item?.connectorName || 'Instituição financeira',
    status: item?.status || 'UPDATED',
    clientUserId: item?.clientUserId || appClientUserId || null,
    lastConnectedAt: item?.lastUpdatedAt || item?.updatedAt || new Date().toISOString(),
  });

  useEffect(() => () => {
    try { widgetRef.current?.destroy?.(); } catch {}
    widgetRef.current = null;
  }, []);

  useEffect(() => {
    if (!syncProgress) {
      setDisplayProgress(0);
      return;
    }

    // A barra deve refletir o progresso real informado pela sincronização.
    // Não avançamos artificialmente alguns pontos, pois isso mascarava a
    // etapa que estava realmente aguardando e fazia o processo parecer
    // travado em 56%.
    const reported = Math.max(0, Math.min(100, Number(syncProgress.percent || 0)));
    setDisplayProgress(reported);
  }, [syncProgress]);

  const clearSyncProgressSoon = () => {
    window.setTimeout(() => setSyncProgress(null), 900);
  };

  const requestToken = async (itemId = null) => {
    const response = await fetch('/.netlify/functions/pluggy-connect-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        itemId: itemId || undefined,
        clientUserId: appUser?.id ? `arquimanager:${appUser.id}` : undefined,
        connectorId: 200,
        meuPluggy: true,
        avoidDuplicates: false,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.accessToken) {
      throw new Error(data.error || 'Não foi possível iniciar a conexão bancária.');
    }

    return data.accessToken;
  };

  const discoverMeuPluggyConnections = async () => {
    if (!appClientUserId) {
      throw new Error('Não foi possível identificar o usuário do Arksuper para localizar as conexões do Meu Pluggy.');
    }

    const response = await fetch('/.netlify/functions/pluggy-list-items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientUserId: appClientUserId }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = data.error || 'Não foi possível localizar as conexões do Meu Pluggy.';
      if (data.requiresIndividualAuthorization) {
        throw new Error(
          detail + ' Autorize cada banco uma vez no botão “Conectar banco”; depois use “Atualizar Meu Pluggy”.'
        );
      }
      throw new Error(detail);
    }

    return Array.isArray(data.items) ? data.items : [];
  };

  const refreshMeuPluggyConnections = async () => {
    setError('');
    setDiscovering(true);
    setBusyId('refresh');
    setSyncProgress({
      percent: 0,
      status: 'Localizando conexões do Meu Pluggy...',
      connectionName: 'Meu Pluggy',
    });
    setDisplayProgress(0);

    try {
      const items = await discoverMeuPluggyConnections();

      if (!items.length) {
        setError(
          'Nenhuma conexão do Meu Pluggy está autorizada nesta aplicação. No Meu Pluggy você pode ter vários bancos; cada banco precisa de uma autorização uma única vez no Arksuper.'
        );
        setSyncProgress({
          percent: 100,
          status: 'Nenhuma conexão autorizada foi encontrada.',
          connectionName: 'Meu Pluggy',
        });
        setDisplayProgress(100);
        clearSyncProgressSoon();
        return;
      }

      const currentByItemId = new Map(
        connections.filter(Boolean).map(connection => [connection.itemId, connection])
      );

      let newConnections = 0;
      let syncedConnections = 0;

      // Uma autorização por banco, mas sincronização de todos os proxy Items
      // já autorizados. Processamos sequencialmente para evitar concorrência
      // desnecessária com o Firestore e com os limites da API.
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (!item?.id) continue;

        const current = currentByItemId.get(item.id);
        const connectionData = connectionDataFromItem(item);
        const basePercent = (index / items.length) * 100;
        const itemSpan = 100 / items.length;

        setSyncProgress({
          percent: Math.round(basePercent + itemSpan * 0.02),
          status: 'Preparando ' + (connectionData.connectorName || 'banco') + '...',
          connectionName: connectionData.connectorName || 'Banco',
        });

        await onSaveConnection?.({
          ...current,
          ...connectionData,
        });

        if (!current) newConnections += 1;

        if (onSyncConnection) {
          const syncResult = await onSyncConnection(connectionData, (progress) => {
            const localPercent = Math.max(0, Math.min(100, Number(progress?.percent || 0)));
            setSyncProgress({
              percent: Math.round(basePercent + (localPercent / 100) * itemSpan),
              status: progress?.status || 'Sincronizando...',
              connectionName: connectionData.connectorName || 'Banco',
            });
          });

          if (syncResult?.ok !== false) {
            syncedConnections += 1;
            setSyncProgress({
              percent: Math.round(basePercent + itemSpan),
              status: (connectionData.connectorName || 'Banco') + ' sincronizado.',
              connectionName: connectionData.connectorName || 'Banco',
            });
          } else {
            setSyncProgress({
              percent: Math.round(basePercent + itemSpan),
              status: 'Falha ao sincronizar ' + (connectionData.connectorName || 'o banco') + '.',
              connectionName: connectionData.connectorName || 'Banco',
            });
          }
        }
      }

      setError('');
      const newText = newConnections
        ? `${newConnections} conexão(ões) nova(s)`
        : 'nenhuma conexão nova';
      setSyncProgress({
        percent: 100,
        status: 'Sincronização do Meu Pluggy concluída.',
        connectionName: 'Meu Pluggy',
      });
      setDisplayProgress(100);
      setBusyId('');
      clearSyncProgressSoon();
      // O parent grava o resultado no Firestore; o snapshot atualiza a lista.
      console.info('[ArquiManager] Meu Pluggy atualizado:', {
        total: items.length,
        novas: newConnections,
      });
      window.dispatchEvent(new CustomEvent('arquimanager:pluggy-refresh', {
        detail: { total: items.length, novas: newConnections, sincronizadas: syncedConnections, newText },
      }));
    } catch (err) {
      setSyncProgress({
        percent: 100,
        status: 'Sincronização interrompida.',
        connectionName: 'Meu Pluggy',
      });
      setDisplayProgress(100);

      // Mesmo sem a permissão opt-in de GET /v2/items, sincronizamos todas as
      // conexões que o Arksuper já conhece. A listagem só é necessária para
      // descobrir proxy Items ainda não registrados localmente.
      if (err?.message?.includes('LIST_ITEMS_FEATURE_NOT_ENABLED')) {
        try {
          const known = connections.filter(connection => connection?.itemId);
          for (const connection of known) {
            if (onSyncConnection) await onSyncConnection(connection);
          }
          setError(
            known.length
              ? 'As conexões já autorizadas foram sincronizadas. Para descobrir automaticamente novos bancos do Meu Pluggy, peça à Pluggy a habilitação da listagem de Items; enquanto isso, autorize cada novo banco uma vez pelo botão “Conectar banco”.'
              : err.message
          );
        } catch (syncError) {
          setError(syncError.message || err.message);
        }
        setSyncProgress({
          percent: 100,
          status: known.length ? 'Sincronização concluída com aviso.' : 'Sincronização interrompida.',
          connectionName: 'Meu Pluggy',
        });
        setDisplayProgress(100);
      } else {
        setError(err.message || 'Não foi possível atualizar as conexões do Meu Pluggy.');
        setSyncProgress({
          percent: 100,
          status: 'Sincronização interrompida.',
          connectionName: 'Meu Pluggy',
        });
        setDisplayProgress(100);
      }
      clearSyncProgressSoon();
    } finally {
      setDiscovering(false);
      setBusyId('');
    }
  };

  const syncConnection = async (connection) => {
    if (!connection?.itemId || !onSyncConnection) return;

    setError('');
    setBusyId(connection.itemId);
    setSyncProgress({
      percent: 0,
      status: 'Preparando sincronização...',
      connectionName: connection.connectorName || 'Banco',
    });
    setDisplayProgress(0);

    try {
      const syncResult = await onSyncConnection(connection, (progress) => {
        setSyncProgress({
          percent: Math.max(0, Math.min(100, Number(progress?.percent || 0))),
          status: progress?.status || 'Sincronizando...',
          connectionName: connection.connectorName || 'Banco',
        });
      });

      if (syncResult?.ok === false) {
        setSyncProgress({
          percent: 100,
          status: 'Sincronização interrompida.',
          connectionName: connection.connectorName || 'Banco',
        });
        setDisplayProgress(100);
        if (syncResult.error) setError(syncResult.error);
      } else {
        setSyncProgress({
          percent: 100,
          status: 'Sincronização concluída.',
          connectionName: connection.connectorName || 'Banco',
        });
        setDisplayProgress(100);
      }
    } finally {
      setBusyId('');
      clearSyncProgressSoon();
    }
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
            O Arksuper sincroniza todos os bancos do Meu Pluggy que já foram autorizados nesta aplicação. A descoberta automática de novas conexões depende da liberação “List items” da Pluggy.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={refreshMeuPluggyConnections}
            disabled={busyId !== '' || discovering || busy}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-black flex items-center gap-2 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={16} className={discovering ? 'animate-spin' : ''}/>
            {discovering ? 'Sincronizando...' : 'Sincronizar Meu Pluggy'}
          </button>
          <button
            onClick={() => startConnection()}
            disabled={busyId !== '' || discovering || busy}
            className="bg-[#1e5aa0] text-white px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 disabled:opacity-50"
          >
            <Link2 size={16}/>
            {busyId === 'new' ? 'Abrindo...' : 'Conectar com Meu Pluggy'}
          </button>
        </div>
      </div>

      <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-blue-800 text-xs font-medium">
        <strong>Meu Pluggy:</strong> C6, Nubank, Mercado Pago e outros bancos podem coexistir. O Arksuper não assume que o primeiro banco conectado é o único; ele procura todos os proxy Items autorizados para o seu usuário.
      </div>

      {syncProgress && (
        <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="min-w-0">
              <p className="text-xs font-black text-blue-900 truncate">
                {syncProgress.connectionName || 'Meu Pluggy'}
              </p>
              <p className="text-[10px] font-bold text-blue-700 truncate">
                {syncProgress.status || 'Sincronizando...'}
              </p>
            </div>
            <span className="text-lg font-black text-blue-800 tabular-nums">
              {Math.min(100, Math.max(0, Math.round(displayProgress)))}%
            </span>
          </div>
          <div className="h-3 bg-white/80 border border-blue-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-[#1e5aa0] transition-all duration-500 ease-out"
              style={{ width: (Math.min(100, Math.max(0, displayProgress)) + '%') }}
            />
          </div>
          <div className="flex items-center justify-between mt-2 text-[9px] font-bold text-blue-600">
            <span>Processando dados do banco</span>
            <span>Os controles serão liberados ao finalizar.</span>
          </div>
        </div>
      )}

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
          <p className="text-xs text-slate-400 mt-1">Cada banco autorizado pelo Meu Pluggy aparece como uma conexão independente no Arksuper.</p>
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
                    onClick={() => syncConnection(connection)}
                    disabled={busyId !== '' || discovering || busy}
                    className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-black flex items-center gap-1 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={busyId === connection.itemId ? 'animate-spin' : ''}/>
                    {busyId === connection.itemId ? 'Sincronizando...' : 'Sincronizar'}
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
                    className="px-2.5 py-2 rounded-xl border border-amber-200 text-amber-700 text-xs font-black flex items-center justify-center gap-1 hover:bg-amber-50 disabled:opacity-50"
                    title="Limpar somente os dados sincronizados deste banco"
                  >
                    <Trash2 size={14}/>
                  </button>
                  <button
                    onClick={() => onDeleteConnection?.(connection)}
                    disabled={busyId !== '' || busy}
                    className="px-2.5 py-2 rounded-xl border border-red-200 text-red-600 text-xs font-black flex items-center justify-center gap-1 hover:bg-red-50 disabled:opacity-50"
                    title="Excluir conexão e revogar autorização no Pluggy"
                  >
                    <XCircle size={14}/>
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
