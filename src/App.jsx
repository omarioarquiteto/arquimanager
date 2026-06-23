import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { 
  LayoutDashboard, Users, FolderKanban, CalendarDays, LogOut, Plus, X, Check,
  ChevronLeft, ChevronRight, Building2, Wallet, TrendingUp, AlertCircle, Edit, Trash2,
  Info, ListTodo, CheckCircle2, Circle, Clock, FileText, Upload, Eye, FolderOpen,
  UserPlus, ShieldCheck, Briefcase, Paperclip, DollarSign, CheckSquare, Settings,
  Printer, LayoutList, Sofa, PaintBucket, Bed, Search, FileDown
} from 'lucide-react';
import ThemeSettingsModal from './ThemeSettingsModal.jsx';
import { useTheme } from './ThemeContext.jsx';

// --- CONFIGURAÇÃO DO FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyBrHpPQFfSGv23stqSw0P_GSn6kchrFYyU",
  authDomain: "arquimanager-1ee9b.firebaseapp.com",
  projectId: "arquimanager-1ee9b",
  storageBucket: "arquimanager-1ee9b.firebasestorage.app",
  messagingSenderId: "148259023703",
  appId: "1:148259023703:web:04a57624f1c526e4b0ac12",
  measurementId: "G-NW2WSES695"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// EXTRAÇÃO RIGOROSA DO APP ID
let safeAppId = 'arquimanager-producao';
if (typeof __app_id !== 'undefined') { safeAppId = String(__app_id).split('_src')[0].split('/')[0]; }
const appId = safeAppId;

// --- UTILITÁRIOS ---
const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const formatDate = (dateString) => {
  if (!dateString) return '';
  const [year, month, day] = dateString?.split('T')[0].split('-');
  if (!day) return '';
  return `${day}/${month}/${year.slice(2)}`;
};
const maskCPFCNPJ = (v) => {
  if (!v) return "";
  v = v.replace(/\D/g, "");
  if (v.length <= 11) return v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, "$1.$2.$3-$4");
  return v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})/, "$1.$2.$3/$4-$5");
};
const maskCEP = (v) => (v || "").replace(/\D/g, "").replace(/^(\d{5})(\d{3})+?$/, "$1-$2");
const generateId = () => Math.random().toString(36).substr(2, 9);
const getToday = () => new Date().toISOString().split('T')[0];

const FASES_ANALITICAS = ['LEVANTAMENTO', 'ESTUDO PRELIMINAR', 'PROJETO CRIATIVO', 'DETALHAMENTO', 'HOMOLOGAÇÃO', 'PROJETO FINALIZADO'];
const SCREENS = [
  {id: 'dashboard', label: 'Dashboard'}, {id: 'projetos', label: 'Projetos'}, {id: 'recebimentos', label: 'Financeiro (Rec)'}, 
  {id: 'pagamentos', label: 'Contas a Pagar'}, {id: 'checklist', label: 'Tarefas & Orçamentos'}, {id: 'clients', label: 'Clientes'}
];
const CATEGORIAS_AMBIENTE = ['Paredes', 'Esquadrias', 'Piso', 'Teto', 'Moveis', 'Decoração', 'Paisagismo', 'Revestimentos', 'Pedras', 'Louças', 'Metais', 'Outros'];

// --- GERADOR DE RELATÓRIO NATIVO (HTML COM PRÉ-VISUALIZAÇÃO E OPÇÕES) ---
const printReport = (title, htmlContent) => {
  const win = window.open('', '_blank');
  win.document.write(`
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 0; margin: 0; color: #333; line-height: 1.6; background: #f1f5f9; }
          
          /* Barra de Ferramentas superior fixa */
          .toolbar { 
            background: #1e293b; 
            padding: 15px; 
            display: flex; 
            gap: 12px; 
            justify-content: center; 
            position: sticky; 
            top: 0; 
            z-index: 100;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          
          .btn { 
            padding: 10px 20px; 
            border-radius: 6px; 
            font-weight: bold; 
            cursor: pointer; 
            border: none; 
            font-size: 13px; 
            text-transform: uppercase;
            transition: all 0.2s;
          }
          .btn-pdf { background: #1e5aa0; color: white; }
          .btn-pdf:hover { background: #154278; }
          .btn-txt { background: #64748b; color: white; }
          .btn-txt:hover { background: #475569; }

          /* Área do conteúdo do relatório */
          .content-wrapper {
            background: white;
            width: 800px;
            margin: 30px auto;
            padding: 50px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.05);
            min-height: 100vh;
          }

          h1 { color: #1e5aa0; border-bottom: 2px solid #1e5aa0; padding-bottom: 10px; }
          h2 { color: #444; margin-top: 30px; font-size: 18px; background: #f1f5f9; padding: 10px; border-radius: 5px; }
          table { border-collapse: collapse; margin-top: 15px; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 10px; text-align: left; font-size: 14px; }
          th { background-color: #1e5aa0; color: white; }
          .total-box { margin-top: 30px; padding: 20px; background: #e0f2fe; border: 2px solid #bae6fd; border-radius: 8px; font-size: 18px; font-weight: bold; text-align: right; }
          .total-box span { color: #0369a1; }

          /* Esconde a barra de ferramentas ao imprimir */
          @media print { 
            .toolbar { display: none !important; } 
            body { background: white; }
            .content-wrapper { margin: 0; padding: 0; width: 100%; box-shadow: none; }
          }
        </style>
      </head>
      <body>
        <div class="toolbar">
          <button class="btn btn-pdf" onclick="window.print()">Gerar PDF / Imprimir</button>
          <button class="btn btn-txt" onclick="downloadTxt()">Exportar para TXT</button>
        </div>
        
        <div class="content-wrapper" id="report-body">
          ${htmlContent}
        </div>

        <script>
          function downloadTxt() {
            // Captura o texto limpo do relatório
            const content = document.getElementById('report-body').innerText;
            const blob = new Blob([content], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = '${title}.txt';
            a.click();
            window.URL.revokeObjectURL(url);
          }
        </script>
      </body>
    </html>
  `);
  win.document.close();
  // A linha setTimeout(() => { win.print(); }, 500); FOI REMOVIDA para não abrir a impressão sozinha.
};

// --- COMPONENTE PRINCIPAL (ROOT) ---
export default function App() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  // Inicializa a sessão buscando da memória do navegador
  const [appUser, setAppUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('arqui_user_session');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch (e) {
      return null;
    }
  });
  const [loadingAuth, setLoadingAuth] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) await signInWithCustomToken(auth, __initial_auth_token);
        else await signInAnonymously(auth);
      } catch (error) { console.error("Erro Auth:", error); }
    };
    initAuth();

    const unsub = onAuthStateChanged(auth, (user) => { setFirebaseUser(user); setLoadingAuth(false); });
    return () => unsub();
  }, []);

// Lógica de Login: Atualiza estado e guarda na memória do navegador
  const handleLoginSuccess = (user) => {
    localStorage.setItem('arqui_user_session', JSON.stringify(user));
    setAppUser(user);
  };

  // Lógica de Logout: Limpa a memória
  const handleLogout = () => {
    localStorage.removeItem('arqui_user_session');
    setAppUser(null);
  };

  if (loadingAuth) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 font-medium">Conectando ao ArquiManager...</div>;
  if (!appUser || !firebaseUser) return <LoginScreen firebaseUser={firebaseUser} onUnlock={handleLoginSuccess} />;

  return <MainLayout firebaseUser={firebaseUser} appUser={appUser} onLogout={handleLogout} />;
}

// --- TELA DE LOGIN E CADASTRO DA EMPRESA ---
function LoginScreen({ firebaseUser, onUnlock }) {
  const [view, setView] = useState('login');
  const [error, setError] = useState('');
  
  const [loginEmail, setLoginEmail] = useState('');
  const [loginSenha, setLoginSenha] = useState('');
  
  const [empresaNome, setEmpresaNome] = useState('');
  const [gestorNome, setGestorNome] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regSenha, setRegSenha] = useState('');

  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'app_accounts'), (snap) => {
      setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => console.error("Erro ao carregar contas:", err));
    return () => unsub();
  }, [firebaseUser]);

  const handleLogin = (e) => {
    e.preventDefault(); setError('');
    const user = accounts.find(a => a.email === loginEmail && a.senha === loginSenha);
    if (user) {
      // COMPATIBILIDADE PARA CONTAS ANTIGAS (LEGADAS)
      if (!user.companyId) user.companyId = 'legado';
      if (!user.role) user.role = 'gestor'; // <--- Esta linha garante o acesso total!
      
      onUnlock(user);
    } else setError('E-mail ou senha incorretos.');
  };

  const handleRegisterCompany = async (e) => {
    e.preventDefault(); setError('');
    if (!empresaNome || !gestorNome || !regEmail || !regSenha) return setError('Preencha todos os campos obrigatórios.');
    if (accounts.some(a => a.email === regEmail)) return setError('Este e-mail já está em uso.');

    try {
      const companyId = generateId();
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'companies'), { nome: empresaNome, dataCriacao: getToday(), id: companyId });
      
      const newGestor = { 
        nome: gestorNome, email: regEmail, senha: regSenha, companyId, role: 'gestor', 
        permissions: { create: true, edit: true, delete: true, screens: SCREENS.map(s=>s.id) },
        allowedProjects: 'ALL'
      };
      const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'app_accounts'), newGestor);
      onUnlock({ id: docRef.id, ...newGestor });
    } catch (err) { setError('Erro ao cadastrar empresa. Tente novamente.'); console.error(err); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-200">
        <div className="flex flex-col items-center mb-6">
          <div className="bg-[#1e5aa0] p-4 rounded-2xl text-white mb-4 shadow-lg shadow-blue-900/20"><Building2 size={40} /></div>
          <h1 className="text-2xl font-black text-slate-800 text-center tracking-tight">ArquiManager</h1>
          <p className="text-slate-500 text-sm text-center font-medium">Gestão Inteligente para Escritórios</p>
        </div>

        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 font-medium border border-red-100 flex items-center"><AlertCircle size={16} className="mr-2 shrink-0"/> {error}</div>}

        {view === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div><label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wide">E-mail</label><input type="email" required value={loginEmail} onChange={e => setLoginEmail(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1e5aa0] outline-none transition-all" placeholder="seu@email.com" /></div>
            <div><label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wide">Senha</label><input type="password" required value={loginSenha} onChange={e => setLoginSenha(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1e5aa0] outline-none transition-all" placeholder="••••••••" /></div>
            <button type="submit" className="w-full bg-[#1e5aa0] text-white font-bold py-3 rounded-lg hover:bg-[#154278] transition-colors shadow-md mt-2">Aceder ao Sistema</button>
            <div className="text-center pt-4 mt-4 border-t border-slate-100"><button type="button" onClick={() => {setView('registerCompany'); setError('');}} className="text-sm text-[#1e5aa0] hover:text-[#154278] font-bold">Dono de Escritório? Cadastre a sua Empresa</button></div>
          </form>
        ) : (
          <form onSubmit={handleRegisterCompany} className="space-y-4">
            <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg text-xs text-blue-800 font-medium mb-4 flex gap-2"><ShieldCheck className="shrink-0 text-blue-600"/><span>Você será o Gestor e poderá convidar a sua equipa depois.</span></div>
            <div><label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wide">Nome da Empresa *</label><input type="text" required value={empresaNome} onChange={e => setEmpresaNome(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1e5aa0] outline-none bg-slate-50" /></div>
            <div><label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wide">Seu Nome (Gestor) *</label><input type="text" required value={gestorNome} onChange={e => setGestorNome(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1e5aa0] outline-none" /></div>
            <div><label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wide">E-mail de Acesso *</label><input type="email" required value={regEmail} onChange={e => setRegEmail(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1e5aa0] outline-none" /></div>
            <div><label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wide">Senha *</label><input type="password" required value={regSenha} onChange={e => setRegSenha(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1e5aa0] outline-none" /></div>
            <button type="submit" className="w-full bg-[#1e5aa0] text-white font-bold py-3 rounded-lg hover:bg-[#154278] transition-colors shadow-md mt-2">Criar Empresa e Entrar</button>
            <div className="text-center pt-2"><button type="button" onClick={() => {setView('login'); setError('');}} className="text-sm text-slate-500 hover:text-slate-700 font-bold">Voltar para o Login</button></div>
          </form>
        )}
      </div>
    </div>
  );
}

// --- VISÃO: GESTÃO DE CLIENTES (COM PROTEÇÃO CONTRA TELA BRANCA) ---
function ClientsView({ clients, projects, canCreate, canEdit, canDelete, appUser, onOpenProject }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [alertMsg, setAlertMsg] = useState('');
  const [confirmData, setConfirmData] = useState(null);

  // Redes de segurança para garantir que os dados são arrays válidos
  const safeClients = Array.isArray(clients) ? clients : [];
  const safeProjects = Array.isArray(projects) ? projects : [];

  const handleDelete = (client) => {
    // Verifica se existem projetos vinculados antes de permitir a exclusão
    const temProjetos = safeProjects.some(p => p && p.clientId === client.id);
    
    if (temProjetos) {
      return setAlertMsg('Há projetos vinculados a este cliente. Não é possível excluir.');
    }
    
    setConfirmData({
      message: 'Excluir cliente permanentemente?',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clients', client.id));
          setConfirmData(null);
        } catch (err) {
          console.error("Erro ao eliminar cliente:", err);
        }
      }
    });
  };

  return (
    <div className="h-full flex flex-col animate-in fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Clientes</h3>
          <p className="text-slate-500 text-sm font-medium">Gestão da base de contactos e projetos vinculados.</p>
        </div>
        {canCreate && (
          <button 
            onClick={() => {setEditingClient(null); setIsModalOpen(true);}} 
            className="bg-[#1e5aa0] text-white px-4 py-2.5 rounded-lg font-bold flex items-center space-x-2 shadow-sm hover:bg-[#154278] transition-colors"
          >
            <Plus size={18}/><span>Novo Cliente</span>
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 overflow-auto">
        <table className="w-full text-left text-sm min-w-[600px]">
          <thead className="bg-[#5a82b5] text-white text-xs uppercase sticky top-0 z-10">
            <tr>
              <th className="p-4">Nome do Cliente</th>
              <th className="p-4">Informações de Contacto</th>
              <th className="p-4 text-center">Projetos Ativos</th>
              <th className="p-4 text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {safeClients.length > 0 ? safeClients.map(c => (
              <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                <td className="p-4 font-bold text-slate-800">{c.nome}</td>
                <td className="p-4">
                  <div className="flex flex-col">
                    <span className="font-medium text-slate-700">{c.telefone || '(Sem telefone)'}</span>
                    <span className="text-xs text-slate-400">{c.email || '(Sem e-mail)'}</span>
                  </div>
                </td>
                <td className="p-4 text-center">
                  <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-bold text-xs border border-slate-200">
                    {safeProjects.filter(p => p && p.clientId === c.id).length} Projetos
                  </span>
                </td>
                <td className="p-4 text-center space-x-3">
                  {canEdit && (
                    <button onClick={() => {setEditingClient(c); setIsModalOpen(true);}} className="text-[#5a82b5] hover:text-[#1e5aa0] transition-colors">
                      <Edit size={18}/>
                    </button>
                  )}
                  {canDelete && (
                    <button onClick={() => handleDelete(c)} className="text-red-400 hover:text-red-600 transition-colors">
                      <Trash2 size={18}/>
                    </button>
                  )}
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan="4" className="p-10 text-center text-slate-400 font-bold uppercase text-xs">
                  Nenhum cliente registado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && <ClientModal appUser={appUser} client={editingClient} onClose={()=>setIsModalOpen(false)}/>}
      {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg('')} />}
      {confirmData && <ConfirmModal message={confirmData.message} onConfirm={confirmData.onConfirm} onCancel={() => setConfirmData(null)} />}
    </div>
  );
}

// --- LAYOUT PRINCIPAL E GESTÃO DE ESTADO GLOBAL ---
function MainLayout({ firebaseUser, appUser, onLogout }) {
  const [currentView, setCurrentView] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isThemeSettingsOpen, setIsThemeSettingsOpen] = useState(false);
  const [targetProjectToEdit, setTargetProjectToEdit] = useState(null);
  const { isLiquid } = useTheme();

  const [company, setCompany] = useState(null);
  const [companyUsers, setCompanyUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [checklists, setChecklists] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [contasPagar, setContasPagar] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [docTypes, setDocTypes] = useState([]);
  const [payGroups, setPayGroups] = useState([]);
  const [paySubgroups, setPaySubgroups] = useState([]);

  useEffect(() => {
    if (!firebaseUser || !appUser) return;
    const cid = appUser.companyId;
    const filterByCompany = (snap) => snap.docs.map(d => ({id: d.id, ...d.data()})).filter(i => !i.companyId || i.companyId === cid);
    const errHandler = (err) => console.error("Firestore Listener Error:", err);

    const uCompany = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'companies'), snap => {
      const myComp = snap.docs.map(d => ({dbId: d.id, ...d.data()})).find(c => c.id === cid);
      setCompany(myComp);
    }, errHandler);

    const uUsers = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'app_accounts'), snap => setCompanyUsers(filterByCompany(snap)), errHandler);
    const uClients = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'clients'), snap => setClients(filterByCompany(snap)), errHandler);
    const uProjects = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'projects'), snap => setProjects(filterByCompany(snap)), errHandler);
    const uChecklists = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'checklists'), snap => setChecklists(filterByCompany(snap)), errHandler);
    const uDocs = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'documents'), snap => setDocuments(filterByCompany(snap)), errHandler);
    const uContas = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'contas_pagar'), snap => setContasPagar(filterByCompany(snap)), errHandler);
    const uSupp = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'fornecedores'), snap => setSuppliers(filterByCompany(snap)), errHandler);
    const uDocT = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'tipos_documento'), snap => setDocTypes(filterByCompany(snap)), errHandler);
    const uGrp = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'grupos_pagamento'), snap => setPayGroups(filterByCompany(snap)), errHandler);
    const uSGrp = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'subgrupos_pagamento'), snap => setPaySubgroups(filterByCompany(snap)), errHandler);

    return () => { uCompany(); uUsers(); uClients(); uProjects(); uChecklists(); uDocs(); uContas(); uSupp(); uDocT(); uGrp(); uSGrp(); };
  }, [firebaseUser, appUser]);

const allowedProjects = useMemo(() => {
    if (!appUser || !projects) return []; // Proteção inicial
    if (appUser.role === 'gestor') return projects;
    if (appUser.allowedProjects === 'ALL') return projects;
    
    // Garante que projIds seja sempre um array, mesmo que o campo não exista no Firebase
    const projIds = Array.isArray(appUser.allowedProjects) ? appUser.allowedProjects : [];
    return projects.filter(p => p && p.id && projIds.includes(p.id));
  }, [projects, appUser]);

  const hasScreenAccess = (screenId) => appUser.role === 'gestor' || (appUser.permissions?.screens || []).includes(screenId);
  const canCreate = appUser.role === 'gestor' || appUser.permissions?.create;
  const canEdit = appUser.role === 'gestor' || appUser.permissions?.edit;
  const canDelete = appUser.role === 'gestor' || appUser.permissions?.delete;

  const renderView = () => {
    if (appUser.role === 'cliente') return <div className="p-8 text-center"><h2 className="text-2xl font-bold text-slate-700">Área do Cliente</h2><p className="text-slate-500">Em breve poderá acompanhar os seus projetos aqui.</p></div>;
    
    switch (currentView) {
      case 'dashboard': return hasScreenAccess('dashboard') ? <DashboardView projects={allowedProjects} checklists={checklists} companyUsers={companyUsers} appUser={appUser} contasPagar={contasPagar} payGroups={payGroups} paySubgroups={paySubgroups} docTypes={docTypes} /> : <NoAccess />;
      case 'clients': return hasScreenAccess('clients') ? <ClientsView clients={clients} projects={allowedProjects} canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} appUser={appUser} onOpenProject={(p)=>{setTargetProjectToEdit(p); setCurrentView('projetos');}} /> : <NoAccess />;
      case 'projetos': return hasScreenAccess('projetos') ? <ProjetosView projects={allowedProjects} clients={clients} companyUsers={companyUsers} targetProject={targetProjectToEdit} clearTargetProject={()=>setTargetProjectToEdit(null)} canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} appUser={appUser} documents={documents} checklists={checklists} /> : <NoAccess />;
      case 'recebimentos': return hasScreenAccess('recebimentos') ? <RecebimentosView projects={allowedProjects} contasPagar={contasPagar} docTypes={docTypes} suppliers={suppliers} canEdit={canEdit} appUser={appUser} groups={payGroups} subgroups={paySubgroups} /> : <NoAccess />;
      case 'pagamentos': return hasScreenAccess('pagamentos') ? <PagamentosView suppliers={suppliers} docTypes={docTypes} groups={payGroups} subgroups={paySubgroups} contasPagar={contasPagar} appUser={appUser} canEdit={canEdit} canDelete={canDelete} /> : <NoAccess />;
      case 'checklist': return hasScreenAccess('checklist') ? <ChecklistView projects={allowedProjects} checklists={checklists} companyUsers={companyUsers} canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} appUser={appUser} documents={documents} /> : <NoAccess />;
      case 'equipe': return appUser.role === 'gestor' ? <EquipeView companyUsers={companyUsers} projects={projects} appUser={appUser} company={company} /> : <NoAccess />;
      default: return <DashboardView projects={allowedProjects} checklists={checklists} companyUsers={companyUsers} appUser={appUser} contasPagar={contasPagar} payGroups={payGroups} paySubgroups={paySubgroups} docTypes={docTypes} />;
    }
  };

  return (
    <div className={`flex h-screen overflow-hidden font-sans relative ${isLiquid ? 'liquid-shell' : ''}`}>
      <div className="app-bg-layer" aria-hidden="true"></div>
      {isMobileMenuOpen && <div className="fixed inset-0 bg-slate-900/50 z-30 md:hidden" onClick={()=>setIsMobileMenuOpen(false)}></div>}
      
      <aside className={`fixed md:static inset-y-0 left-0 w-64 bg-slate-900 text-slate-300 flex flex-col transition-transform transform z-40 ${isLiquid ? 'liquid-sidebar' : ''} ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="sidebar-header p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-2 text-white"><Building2 size={24} className="text-[#1e5aa0]"/><span className="text-xl font-bold tracking-tight">ARQUI<span className="font-light">MGR</span></span></div>
          <button className="md:hidden text-slate-400" onClick={()=>setIsMobileMenuOpen(false)}><X size={24}/></button>
        </div>
        <div className="sidebar-user-area px-5 py-4 bg-slate-800/40">
          <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">{appUser.role}</p>
          <p className="text-sm text-white font-bold truncate">{appUser.nome}</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {hasScreenAccess('dashboard') && <SidebarItem icon={<LayoutDashboard size={18}/>} label="Dashboard" active={currentView === 'dashboard'} onClick={() => { setCurrentView('dashboard'); setIsMobileMenuOpen(false); }} />}
          {hasScreenAccess('projetos') && <SidebarItem icon={<FolderKanban size={18}/>} label="Projetos" active={currentView === 'projetos'} onClick={() => { setCurrentView('projetos'); setIsMobileMenuOpen(false); }} />}
          {hasScreenAccess('recebimentos') && <SidebarItem icon={<CalendarDays size={18}/>} label="Financeiro" active={currentView === 'recebimentos'} onClick={() => { setCurrentView('recebimentos'); setIsMobileMenuOpen(false); }} />}
          {hasScreenAccess('pagamentos') && <SidebarItem icon={<DollarSign size={18}/>} label="Contas a Pagar" active={currentView === 'pagamentos'} onClick={() => { setCurrentView('pagamentos'); setIsMobileMenuOpen(false); }} />}
          {hasScreenAccess('checklist') && <SidebarItem icon={<ListTodo size={18}/>} label="Tarefas & Orçamentos" active={currentView === 'checklist'} onClick={() => { setCurrentView('checklist'); setIsMobileMenuOpen(false); }} />}
          {hasScreenAccess('clients') && <SidebarItem icon={<Users size={18}/>} label="Clientes" active={currentView === 'clients'} onClick={() => { setCurrentView('clients'); setIsMobileMenuOpen(false); }} />}
          {appUser.role === 'gestor' && <SidebarItem icon={<Settings size={18}/>} label="Equipa e Acessos" active={currentView === 'equipe'} onClick={() => { setCurrentView('equipe'); setIsMobileMenuOpen(false); }} />}
        </nav>
        <div className="p-4 border-t border-slate-800 space-y-2">
          <button onClick={() => setIsThemeSettingsOpen(true)} className={`flex items-center space-x-3 w-full p-2 rounded-lg font-medium transition-colors ${isLiquid ? 'liquid-sidebar-item' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><PaintBucket size={18} /><span>Aparência</span></button>
          <button onClick={onLogout} className={`flex items-center space-x-3 w-full p-2 rounded-lg font-medium transition-colors ${isLiquid ? 'liquid-sidebar-item' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><LogOut size={18} /><span>Sair</span></button>
        </div>
      </aside>

      <main className={`flex-1 overflow-auto flex flex-col relative w-full z-10 ${isLiquid ? 'liquid-content' : ''}`}>
        <div className={`md:hidden bg-slate-900 text-white p-3 flex justify-between items-center shrink-0 z-20 sticky top-0 shadow-md ${isLiquid ? 'liquid-mobile-header' : ''}`}>
          <div className="flex items-center space-x-2"><Building2 size={20} className="text-[#1e5aa0]"/><span className="font-bold tracking-tight">ARQUI<span className="font-light">MGR</span></span></div>
          <button onClick={() => setIsMobileMenuOpen(true)}><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg></button>
        </div>
        <div className={`p-4 sm:p-6 flex-1 overflow-auto ${isLiquid ? 'bg-transparent' : 'bg-slate-50/90 backdrop-blur-sm'}`}>{renderView()}</div>
      </main>
      {isThemeSettingsOpen && <ThemeSettingsModal onClose={() => setIsThemeSettingsOpen(false)} />}
    </div>
  );
}

// --- NOVO MÓDULO: CONTAS A PAGAR ---
function PagamentosView({ suppliers, docTypes, groups, subgroups, contasPagar, appUser, canEdit, canDelete }) {
  const [subTab, setSubTab] = useState('pendentes');
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [alertMsg, setAlertMsg] = useState('');
  const [confirmData, setConfirmData] = useState(null);

  // Estados dos Filtros
  const [filterFornecedor, setFilterFornecedor] = useState('');
  const [filterBanco, setFilterBanco] = useState('');
  const [filterData, setFilterData] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({ fornecedor: '', banco: '', data: '' });

  const handleApplyFilters = () => {
    setAppliedFilters({ fornecedor: filterFornecedor, banco: filterBanco, data: filterData });
  };

  const handleClearFilters = () => {
    setFilterFornecedor('');
    setFilterBanco('');
    setFilterData('');
    setAppliedFilters({ fornecedor: '', banco: '', data: '' });
  };

  // Sincronização automática de status baseado nas parcelas (Análise de integridade)
  useEffect(() => {
    if (!contasPagar) return;
    contasPagar.forEach(async (c) => {
      if (!c.parcelas || c.parcelas.length === 0) return;
      const todasPagas = c.parcelas.every(p => p.status === 'pago');
      const targetStatus = todasPagas ? 'pago' : 'pendente';
      
      // Só atualiza se o status atual estiver divergente da realidade das parcelas
      if (c.status !== targetStatus) {
        try {
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'contas_pagar', c.id), { status: targetStatus });
        } catch (err) { console.error("Erro ao sincronizar status do documento:", err); }
      }
    });
  }, [contasPagar]);

  // Lógica de Filtragem e Ordenação
  const filteredAndSorted = useMemo(() => {
    if (subTab !== 'pendentes' && subTab !== 'pagos') return [];

    let list = (contasPagar || []).filter(c => 
      subTab === 'pagos' ? c.status === 'pago' : c.status !== 'pago'
    );

    if (appliedFilters.fornecedor) {
      list = list.filter(c => {
        const s = suppliers.find(sup => sup.id === c.fornecedorId);
        return s?.nome?.toLowerCase().includes(appliedFilters.fornecedor.toLowerCase());
      });
    }
    if (appliedFilters.banco) {
      list = list.filter(c => c.banco?.toLowerCase().includes(appliedFilters.banco.toLowerCase()));
    }
    if (appliedFilters.data) {
      list = list.filter(c => c.dataVencimento === appliedFilters.data);
    }

    // Ordenação por Data de Vencimento
    list.sort((a, b) => (a.dataVencimento || '').localeCompare(b.dataVencimento || ''));
    return list;
  }, [contasPagar, subTab, appliedFilters, suppliers]);

  const handleDelete = (c) => {
    // Verifica se alguma parcela individual já foi paga
    const temParcelasPagas = (c.parcelas || []).some(p => p.status === 'pago');

    if (temParcelasPagas) {
      return setAlertMsg('Não é possível excluir este lançamento, pois ele possui parcelas que já foram pagas.');
    }
    setConfirmData({
      message: 'Excluir este lançamento permanentemente?',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'contas_pagar', c.id));
          setConfirmData(null);
        } catch (err) { console.error("Erro ao eliminar lançamento:", err); }
      }
    });
  };

  return (
    <div className="h-full flex flex-col animate-in fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Contas a Pagar</h3>
          <p className="text-slate-500 text-sm font-medium">Gestão de despesas, faturas e fornecedores do escritório.</p>
        </div>
      </div>

      <div className="flex space-x-2 bg-white p-1.5 rounded-xl shadow-sm mb-6 border border-slate-200 shrink-0">
        {[
          { id: 'pendentes', label: 'Pendentes', icon: <Clock size={16}/> },
          { id: 'pagos', label: 'Pagos', icon: <CheckCircle2 size={16}/> },
          { id: 'fornecedores', label: 'Fornecedores', icon: <Users size={16}/> },
          { id: 'config', label: 'Configurações', icon: <Settings size={16}/> }
        ].map(tab => (
          <button key={tab.id} onClick={() => setSubTab(tab.id)} className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-bold text-xs uppercase transition-all ${subTab === tab.id ? 'bg-[#1e5aa0] text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        {(subTab === 'pendentes' || subTab === 'pagos') && (
          <div className="space-y-6">
            <div className="flex justify-between items-center border-b pb-4">
              <h4 className="font-black text-slate-700 uppercase text-sm">{subTab === 'pendentes' ? 'Contas em Aberto' : 'Histórico de Pagamentos'}</h4>
              <button 
                onClick={() => setIsEntryModalOpen(true)}
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold text-xs uppercase flex items-center gap-2 hover:bg-emerald-700 transition-colors"
              >
                <Plus size={16}/> Novo Lançamento
              </button>
            </div>

            {/* Área de Filtros */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 items-end">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Filtrar Fornecedor</label>
                <input value={filterFornecedor} onChange={e => setFilterFornecedor(e.target.value)} placeholder="Nome do fornecedor..." className="w-full p-2 border rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#1e5aa0]" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Filtrar Banco</label>
                <input value={filterBanco} onChange={e => setFilterBanco(e.target.value)} placeholder="Instituição bancária..." className="w-full p-2 border rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#1e5aa0]" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Data de Vencimento</label>
                <input type="date" value={filterData} onChange={e => setFilterData(e.target.value)} className="w-full p-2 border rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#1e5aa0]" />
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={handleApplyFilters}
                  className="flex-1 bg-[#1e5aa0] text-white py-2 px-3 rounded-lg font-bold text-[10px] uppercase hover:bg-[#154278] transition-colors shadow-sm h-[38px]"
                >
                  Aplicar
                </button>
                <button 
                  onClick={handleClearFilters}
                  className="flex-1 bg-slate-200 text-slate-600 py-2 px-3 rounded-lg font-bold text-[10px] uppercase hover:bg-slate-300 transition-colors h-[38px]"
                >
                  Limpar
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-slate-400 uppercase font-black border-b">
                  <tr><th className="pb-3">Vencimento</th><th className="pb-3">Fornecedor</th><th className="pb-3">Banco</th><th className="pb-3">Descrição</th><th className="pb-3 text-right">Valor</th><th className="pb-3 text-center">Status</th><th className="pb-3 text-center">Ações</th></tr>
                </thead>
                <tbody className="divide-y">
                  {filteredAndSorted.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="py-4 font-bold">{formatDate(c.dataVencimento)}</td>
                      <td className="py-4 font-bold text-slate-800">{suppliers.find(s=>s.id===c.fornecedorId)?.nome || 'N/A'}</td>
                      <td className="py-4 text-xs font-bold text-slate-500 uppercase">{c.banco || '-'}</td>
                      <td className="py-4 text-slate-500">{c.descricao}</td>
                      <td className="py-4 text-right font-black text-red-600">{formatCurrency(c.valor)}</td>
                      <td className="py-4 text-center">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${c.status === 'pago' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="py-4 text-center space-x-3">
                        {canEdit && (
                          <button onClick={() => { setEditingEntry(c); setIsEntryModalOpen(true); }} className="text-[#5a82b5] hover:text-[#1e5aa0]">
                            <Edit size={16}/>
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => handleDelete(c)} className="text-red-400 hover:text-red-600">
                            <Trash2 size={16}/>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredAndSorted.length === 0 && <tr><td colSpan="7" className="py-10 text-center text-slate-400 font-bold uppercase text-xs">Nenhum lançamento encontrado.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {subTab === 'fornecedores' && <SuppliersManager suppliers={suppliers} appUser={appUser} contasPagar={contasPagar} />}
        {subTab === 'config' && <AuxiliarySettings docTypes={docTypes} groups={groups} subgroups={subgroups} appUser={appUser} />}
      </div>

      {isEntryModalOpen && (
        <EntryModal 
          onClose={() => { setIsEntryModalOpen(false); setEditingEntry(null); }} 
          suppliers={suppliers} 
          docTypes={docTypes} 
          groups={groups} 
          subgroups={subgroups} 
          appUser={appUser} 
          editingEntry={editingEntry}
        />
      )}

      {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg('')} />}
      {confirmData && <ConfirmModal message={confirmData.message} onConfirm={confirmData.onConfirm} onCancel={() => setConfirmData(null)} />}
    </div>
  );
}

function EntryModal({ onClose, suppliers, docTypes, groups, subgroups, appUser, editingEntry }) {
  const [formData, setFormData] = useState(editingEntry ? {
    ...editingEntry,
    valorTotal: editingEntry.valorTotal || editingEntry.valor,
  } : {
    dataVencimento: getToday(), fornecedorId: '', descricao: '', valorTotal: '', status: 'pendente',
    tipoDocumentoId: '', grupoId: '', subgrupoId: '', numParcelas: 1, banco: '', parcelas: []
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (editingEntry && editingEntry.fornecedorId) {
      const supp = suppliers.find(s => s.id === editingEntry.fornecedorId);
      if (supp) setSearchTerm(supp.nome);
    }
  }, [editingEntry, suppliers]);

  const filteredSuppliers = (suppliers || []).filter(s => (s.nome || "").toLowerCase().includes(searchTerm.toLowerCase()));
  const selectedDocType = docTypes.find(t => t.id === formData.tipoDocumentoId);
  const isFatura = selectedDocType?.isFatura;

  // Gera as parcelas automaticamente quando o valor total ou número de parcelas muda
  const gerarParcelas = () => {
    const valor = parseFloat(formData.valorTotal || 0);
    const num = parseInt(formData.numParcelas || 1);
    if (valor <= 0 || num <= 0) return;

    const valorBase = Math.floor((valor / num) * 100) / 100;
    const resto = parseFloat((valor - (valorBase * num)).toFixed(2));

    const novasParcelas = Array.from({ length: num }).map((_, i) => {
      const data = new Date(formData.dataVencimento);
      data.setMonth(data.getMonth() + i);
      return {
        id: generateId(), numero: i + 1, valor: i === 0 ? parseFloat((valorBase + resto).toFixed(2)) : valorBase,
        dataVencimento: data.toISOString().split('T')[0], status: 'pendente'
      };
    });
    setFormData(prev => ({ ...prev, parcelas: novasParcelas }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.fornecedorId) return alert("Por favor, selecione um fornecedor usando a pesquisa.");
    // Garante que o valor total é a soma exata das parcelas e define o status
    const totalCalculado = (formData.parcelas || []).reduce((acc, p) => acc + (parseFloat(p.valor) || 0), 0);
    const isTotalmentePago = (formData.parcelas || []).length > 0 && formData.parcelas.every(p => p.status === 'pago');

    try {
      const data = {
        ...formData,
        valor: totalCalculado,
        valorTotal: totalCalculado,
        status: isTotalmentePago ? 'pago' : 'pendente',
        companyId: appUser.companyId,
        dataAtualizacao: new Date().toISOString()
      };

      if (editingEntry) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'contas_pagar', editingEntry.id), data);
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'contas_pagar'), {
          ...data, dataCriacao: new Date().toISOString()
        });
      }
      onClose();
    } catch (err) { console.error("Erro ao salvar lançamento:", err); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-[80] backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-4 bg-[#1e5aa0] text-white font-bold flex justify-between items-center uppercase text-sm">{editingEntry ? 'Editar Lançamento' : 'Novo Lançamento'} <button onClick={onClose}><X size={20}/></button></div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="relative">
            <label className="text-xs font-bold text-slate-500 uppercase">Fornecedor (Pesquisar) *</label>
            <div className="relative mt-1">
              <input required type="text" placeholder="Digite o nome..." value={searchTerm} onFocus={()=>setShowResults(true)} onChange={e=>{setSearchTerm(e.target.value); setShowResults(true); if(formData.fornecedorId) setFormData({...formData, fornecedorId:''});}} className="w-full p-2.5 pl-10 border rounded-lg focus:ring-2 outline-none font-bold text-slate-700" />
              <Search className="absolute left-3 top-3 text-slate-400" size={18} />
              {formData.fornecedorId && <CheckCircle2 className="absolute right-3 top-3 text-emerald-500" size={18} />}
            </div>
            {showResults && searchTerm && !formData.fornecedorId && (
              <div className="absolute z-50 w-full bg-white border rounded-lg mt-1 shadow-xl max-h-40 overflow-y-auto divide-y">
                {filteredSuppliers.map(s => (
                  <div key={s.id} onClick={()=>{setFormData({...formData, fornecedorId: s.id}); setSearchTerm(s.nome); setShowResults(false);}} className="p-3 hover:bg-blue-50 cursor-pointer text-sm font-bold text-slate-700 transition-colors">{s.nome}</div>
                ))}
                {filteredSuppliers.length === 0 && <div className="p-3 text-xs text-slate-400 font-bold uppercase">Nenhum fornecedor encontrado</div>}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs font-bold text-slate-500 uppercase">Data 1º Vencimento *</label><input required type="date" value={formData.dataVencimento} onChange={e=>setFormData({...formData, dataVencimento:e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none font-bold" /></div>
            <div><label className="text-xs font-bold text-slate-500 uppercase">Valor Total (R$) *</label><input required type="number" step="0.01" value={formData.valorTotal} onChange={e=>setFormData({...formData, valorTotal:e.target.value})} onBlur={gerarParcelas} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none font-bold text-red-600" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs font-bold text-slate-500 uppercase">Nº de Parcelas *</label><input required type="number" min="1" value={formData.numParcelas} onChange={e=>setFormData({...formData, numParcelas:e.target.value})} onBlur={gerarParcelas} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none font-bold" /></div>
            {isFatura && (
              <div className="animate-in slide-in-from-top-2">
                <label className="text-xs font-bold text-[#1e5aa0] uppercase">Instituição / Banco *</label>
                <input required type="text" placeholder="Ex: Itaú, Nubank..." value={formData.banco} onChange={e=>setFormData({...formData, banco:e.target.value})} className="w-full p-2.5 border border-blue-200 rounded-lg focus:ring-2 mt-1 outline-none font-bold bg-blue-50" />
              </div>
            )}
          </div>
          <div><label className="text-xs font-bold text-slate-500 uppercase">Descrição / Observação</label><input value={formData.descricao} onChange={e=>setFormData({...formData, descricao:e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none font-bold" /></div>
          
          {formData.parcelas.length > 0 && (
            <div className="border rounded-xl overflow-hidden">
              <div className="bg-slate-100 p-2 text-[10px] font-black uppercase text-slate-500 text-center border-b">Detalhamento das Parcelas</div>
              <div className="max-h-32 overflow-y-auto divide-y bg-white">
                {formData.parcelas.map((p, idx) => (
                  <div key={p.id} className="p-2 grid grid-cols-3 gap-2 items-center">
                    <span className="text-[10px] font-bold text-slate-400">Parc. {p.numero}</span>
                    <input type="date" value={p.dataVencimento} onChange={e => {
                      const newP = [...formData.parcelas];
                      newP[idx].dataVencimento = e.target.value;
                      setFormData({...formData, parcelas: newP});
                    }} className="text-[10px] font-bold border rounded p-1 outline-none" />
                    <input type="number" step="0.01" value={p.valor} onChange={e => {
                      const newP = [...formData.parcelas];
                      const newVal = parseFloat(e.target.value || 0);
                      newP[idx].valor = newVal;
                      // Recalcula o total do cabeçalho ao editar uma parcela manual
                      const novoTotalHeader = newP.reduce((acc, cur) => acc + (parseFloat(cur.valor) || 0), 0);
                      setFormData({...formData, parcelas: newP, valorTotal: novoTotalHeader.toString()});
                    }} className="text-[10px] font-black text-red-600 border rounded p-1 outline-none text-right" />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t pt-4 bg-slate-50 p-3 rounded-xl border border-dashed">
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase">Tipo Documento</label>
              <select value={formData.tipoDocumentoId} onChange={e=>setFormData({...formData, tipoDocumentoId:e.target.value})} className="w-full p-2 border rounded bg-white text-xs font-bold mt-1 outline-none"><option value="">Selecione...</option>{docTypes.map(t=><option key={t.id} value={t.id}>{t.nome}</option>)}</select>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase">Grupo</label>
              <select value={formData.grupoId} onChange={e=>setFormData({...formData, grupoId:e.target.value})} className="w-full p-2 border rounded bg-white text-xs font-bold mt-1 outline-none"><option value="">Selecione...</option>{groups.map(g=><option key={g.id} value={g.id}>{g.nome}</option>)}</select>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase">Subgrupo</label>
              <select value={formData.subgrupoId} onChange={e=>setFormData({...formData, subgrupoId:e.target.value})} className="w-full p-2 border rounded bg-white text-xs font-bold mt-1 outline-none"><option value="">Selecione...</option>{subgroups.map(s=><option key={s.id} value={s.id}>{s.nome}</option>)}</select>
            </div>
          </div>
          <button type="submit" className="w-full bg-emerald-600 text-white font-bold py-3.5 rounded-xl hover:bg-emerald-700 shadow-lg uppercase text-xs transition-all active:scale-95 mt-2">Confirmar Lançamento</button>
        </form>
      </div>
    </div>
  );
}

function SuppliersManager({ suppliers, appUser, contasPagar }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ nome: '', documento: '', email: '', telefone: '', cep: '', logradouro: '', bairro: '', cidade: '', uf: '' });
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [alertMsg, setAlertMsg] = useState('');
  const [confirmData, setConfirmData] = useState(null);

  // Sincroniza o formulário ao abrir para edição ou resetar para novo
  useEffect(() => {
    if (editingSupplier && isModalOpen) {
      setFormData({
        nome: editingSupplier.nome || '',
        documento: editingSupplier.documento || '',
        email: editingSupplier.email || '',
        telefone: editingSupplier.telefone || '',
        cep: editingSupplier.cep || '',
        logradouro: editingSupplier.logradouro || '',
        bairro: editingSupplier.bairro || '',
        cidade: editingSupplier.cidade || '',
        uf: editingSupplier.uf || ''
      });
    } else if (!isModalOpen) {
      setFormData({ nome: '', documento: '', email: '', telefone: '', cep: '', logradouro: '', bairro: '', cidade: '', uf: '' });
      setEditingSupplier(null);
    }
  }, [editingSupplier, isModalOpen]);

  const handleCepBlur = async (e) => {
    const cep = e.target.value.replace(/\D/g, '');
    if (cep.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setFormData(prev => ({ ...prev, logradouro: data.logradouro, bairro: data.bairro, cidade: data.localidade, uf: data.uf }));
        }
      } catch (err) { console.error("Erro na busca de CEP:", err); }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = { ...formData, companyId: appUser.companyId };
    if (editingSupplier) {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'fornecedores', editingSupplier.id), data);
    } else {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'fornecedores'), data);
    }
    setIsModalOpen(false);
  };

  const handleDelete = (s) => {
    // Verifica se o fornecedor está vinculado a algum lançamento em "contas_pagar"
    const temVinculo = (contasPagar || []).some(c => c.fornecedorId === s.id);
    
    if (temVinculo) {
      return setAlertMsg('Não é possível excluir este fornecedor, pois ele está vinculado a um ou mais lançamentos de documentos.');
    }

    setConfirmData({
      message: `Excluir fornecedor "${s.nome}" permanentemente?`,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'fornecedores', s.id));
          setConfirmData(null);
        } catch (err) { console.error("Erro ao eliminar fornecedor:", err); }
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <h4 className="font-black text-slate-700 uppercase text-sm">Cadastro de Fornecedores</h4>
        <button onClick={()=>setIsModalOpen(true)} className="bg-[#1e5aa0] text-white px-4 py-2 rounded-lg font-bold text-xs uppercase flex items-center gap-2 hover:bg-[#154278]">
          <Plus size={16}/> Novo Fornecedor
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {suppliers.map(s => (
          <div key={s.id} className="border rounded-xl p-4 bg-slate-50 relative group hover:border-[#1e5aa0] transition-colors">
            <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={(e) => { e.stopPropagation(); setEditingSupplier(s); setIsModalOpen(true); }} className="text-slate-300 hover:text-[#1e5aa0]"><Edit size={16}/></button>
              <button onClick={(e) => { e.stopPropagation(); handleDelete(s); }} className="text-slate-300 hover:text-red-500"><Trash2 size={16}/></button>
            </div>
            <p className="font-black text-slate-800 uppercase text-xs mb-1">{s.nome}</p>
            <p className="text-[10px] text-slate-500 font-bold mb-3">{s.documento ? maskCPFCNPJ(s.documento) : 'Sem documento'}</p>
            <div className="flex flex-col gap-1 text-[10px] font-bold text-[#1e5aa0]">
              <span className="flex items-center gap-1"><Clock size={12}/> {s.telefone || '(00) 0000-0000'}</span>
              <span className="flex items-center gap-1"><Eye size={12}/> {s.email || 'sem@email.com'}</span>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-[80] backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-4 bg-[#1e5aa0] text-white font-bold flex justify-between items-center uppercase text-sm">
              {editingSupplier ? 'Editar Fornecedor' : 'Novo Fornecedor'} 
              <button onClick={()=>{setIsModalOpen(false); setEditingSupplier(null);}}><X size={20}/></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div><label className="text-xs font-bold text-slate-500 uppercase">Nome / Razão Social *</label><input required value={formData.nome} onChange={e=>setFormData({...formData, nome:e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none font-bold" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs font-bold text-slate-500 uppercase">CPF / CNPJ</label><input value={maskCPFCNPJ(formData.documento)} onChange={e=>setFormData({...formData, documento:e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none font-bold" /></div>
                <div><label className="text-xs font-bold text-slate-500 uppercase">Telefone</label><input value={formData.telefone} onChange={e=>setFormData({...formData, telefone:e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none font-bold" /></div>
              </div>
              <div><label className="text-xs font-bold text-slate-500 uppercase">E-mail</label><input type="email" value={formData.email} onChange={e=>setFormData({...formData, email:e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none font-bold" /></div>
              <div className="grid grid-cols-3 gap-4 border-t pt-4">
                <div className="col-span-1"><label className="text-xs font-bold text-slate-500 uppercase">CEP</label><input value={maskCEP(formData.cep || '')} onBlur={handleCepBlur} onChange={e=>setFormData({...formData, cep:e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none font-bold" /></div>
                <div className="col-span-2"><label className="text-xs font-bold text-slate-500 uppercase">Endereço</label><input value={formData.logradouro || ''} onChange={e=>setFormData({...formData, logradouro:e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none font-bold" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs font-bold text-slate-500 uppercase">Bairro</label><input value={formData.bairro || ''} onChange={e=>setFormData({...formData, bairro:e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none font-bold" /></div>
                <div><label className="text-xs font-bold text-slate-500 uppercase">Cidade / UF</label><div className="flex gap-1"><input value={formData.cidade || ''} onChange={e=>setFormData({...formData, cidade:e.target.value})} className="flex-1 p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none font-bold" /><input value={formData.uf || ''} onChange={e=>setFormData({...formData, uf:e.target.value.toUpperCase()})} maxLength="2" className="w-12 p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none font-bold text-center" /></div></div>
              </div>
              <button type="submit" className="w-full bg-[#1e5aa0] text-white font-bold py-3 rounded-xl hover:bg-[#154278] shadow-md uppercase text-xs">{editingSupplier ? 'Salvar Alterações' : 'Cadastrar Fornecedor'}</button>
            </form>
          </div>
        </div>
      )}

      {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg('')} />}
      {confirmData && <ConfirmModal message={confirmData.message} onConfirm={confirmData.onConfirm} onCancel={() => setConfirmData(null)} />}
    </div>
  );
}

function AuxiliarySettings({ docTypes, groups, subgroups, appUser }) {
  const [newType, setNewType] = useState({ nome: '', isFatura: false });
  const [newGroup, setNewGroup] = useState('');
  const [newSub, setNewSub] = useState('');

  const add = async (col, data, setter, isString = false) => {
    const payload = isString ? { nome: data } : data;
    if (!payload.nome) return;
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', col), { ...payload, companyId: appUser.companyId });
    setter(isString ? '' : { nome: '', isFatura: false });
  };

  const del = async (col, id) => {
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', col, id));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Tipos de Documento */}
      <div className="space-y-4">
        <h4 className="font-black text-slate-700 uppercase text-xs border-b pb-2">Tipos de Documento</h4>
        <div className="flex flex-col gap-2">
          <input className="border rounded-lg p-2 text-xs font-bold" placeholder="Ex: NF, Recibo..." value={newType.nome} onChange={e=>setNewType({...newType, nome: e.target.value})} />
          <label className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-500">
            <input type="checkbox" checked={newType.isFatura} onChange={e=>setNewType({...newType, isFatura: e.target.checked})} className="w-4 h-4 accent-[#1e5aa0]" /> É uma Fatura?
          </label>
          <button onClick={()=>add('tipos_documento', newType, setNewType)} className="bg-slate-100 hover:bg-slate-200 p-2 rounded-lg font-bold text-xs uppercase text-slate-600 transition-colors">Adicionar</button>
        </div>
        <div className="space-y-1">
          {docTypes.map(t => (
            <div key={t.id} className="flex justify-between items-center p-2 bg-slate-50 rounded border border-slate-100 text-[10px] font-bold uppercase">
              <span>{t.nome} {t.isFatura && '💳'}</span>
              <button onClick={()=>del('tipos_documento', t.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={14}/></button>
            </div>
          ))}
        </div>
      </div>

      {/* Grupos de Pagamento */}
      <div className="space-y-4">
        <h4 className="font-black text-slate-700 uppercase text-xs border-b pb-2">Grupos de Despesa</h4>
        <div className="flex gap-2">
          <input className="flex-1 border rounded-lg p-2 text-xs font-bold" placeholder="Ex: Fixas, Impostos..." value={newGroup} onChange={e=>setNewGroup(e.target.value)} />
          <button onClick={()=>add('grupos_pagamento', newGroup, setNewGroup, true)} className="bg-slate-100 hover:bg-slate-200 p-2 rounded-lg font-bold text-xs uppercase text-slate-600 transition-colors">Add</button>
        </div>
        <div className="space-y-1">
          {groups.map(g => (
            <div key={g.id} className="flex justify-between items-center p-2 bg-slate-50 rounded border border-slate-100 text-[10px] font-bold uppercase">
              <span>{g.nome}</span>
              <button onClick={()=>del('grupos_pagamento', g.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={14}/></button>
            </div>
          ))}
        </div>
      </div>

      {/* Subgrupos */}
      <div className="space-y-4">
        <h4 className="font-black text-slate-700 uppercase text-xs border-b pb-2">Subgrupos</h4>
        <div className="flex gap-2">
          <input className="flex-1 border rounded-lg p-2 text-xs font-bold" placeholder="Ex: Aluguel, Luz..." value={newSub} onChange={e=>setNewSub(e.target.value)} />
          <button onClick={()=>add('subgrupos_pagamento', newSub, setNewSub, true)} className="bg-slate-100 hover:bg-slate-200 p-2 rounded-lg font-bold text-xs uppercase text-slate-600 transition-colors">Add</button>
        </div>
        <div className="space-y-1">
          {subgroups.map(s => (
            <div key={s.id} className="flex justify-between items-center p-2 bg-slate-50 rounded border border-slate-100 text-[10px] font-bold uppercase">
              <span>{s.nome}</span>
              <button onClick={()=>del('subgrupos_pagamento', s.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={14}/></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick }) {
  const { isLiquid } = useTheme();
  return <button onClick={onClick} className={`flex items-center space-x-3 w-full p-2.5 rounded-lg transition-all text-sm font-medium ${isLiquid ? `liquid-sidebar-item ${active ? 'active' : ''}` : active ? 'bg-[#1e5aa0] text-white shadow-md' : 'hover:bg-slate-800 hover:text-white text-slate-300'}`}>{icon}<span>{label}</span></button>;
}

function NoAccess() {
  return <div className="h-full flex flex-col items-center justify-center text-slate-400"><ShieldCheck size={64} className="mb-4 opacity-50"/><p className="text-lg font-bold">Acesso Restrito</p><p className="text-sm">Não tem permissão para visualizar este ecrã.</p></div>;
}

// --- VISÃO: EQUIPA E EMPRESA (Somente Gestor) ---
function EquipeView({ companyUsers, projects, appUser, company }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  
  const [alertMsg, setAlertMsg] = useState('');
  const [confirmData, setConfirmData] = useState(null);

  const handleDelete = (u) => {
    if (u.id === appUser.id) return setAlertMsg("Não pode excluir a sua própria conta.");
    setConfirmData({
      message: `Remover ${u.nome} da empresa?`,
      onConfirm: async () => {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'app_accounts', u.id));
        setConfirmData(null);
      }
    });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Equipa & Acessos</h3>
          <p className="text-slate-500 text-sm">Faça a gestão de utilizadores, cargos e dados da empresa <strong className="text-[#1e5aa0]">{company?.nome}</strong>.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setIsCompanyModalOpen(true)} className="bg-white border border-slate-300 text-[#1e5aa0] px-4 py-2.5 rounded-lg font-bold flex items-center space-x-2 shadow-sm hover:bg-slate-50 transition-colors">
            <Building2 size={18}/><span className="hidden sm:inline">Editar Empresa</span>
          </button>
          <button onClick={() => {setEditingUser(null); setIsModalOpen(true);}} className="bg-[#1e5aa0] text-white px-4 py-2.5 rounded-lg font-bold flex items-center space-x-2 shadow-sm hover:bg-[#154278] transition-colors">
            <UserPlus size={18}/><span className="hidden sm:inline">Novo Utilizador</span>
          </button>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm flex-1 overflow-auto">
        <table className="w-full text-left text-sm min-w-[600px]">
          <thead className="bg-[#5a82b5] text-white text-xs uppercase sticky top-0"><tr><th className="p-3">Utilizador</th><th className="p-3">Cargo</th><th className="p-3">Permissões</th><th className="p-3 text-center">Ações</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {companyUsers.map(u => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="p-3"><p className="font-bold text-slate-800">{u.nome} {u.id===appUser.id && <span className="text-[10px] bg-blue-100 text-blue-800 px-2 rounded-full ml-2">Você</span>}</p><p className="text-xs text-slate-500">{u.email}</p></td>
                <td className="p-3 uppercase font-black text-xs text-slate-600">{u.role}</td>
                <td className="p-3 text-xs text-slate-500">{u.role === 'gestor' ? 'Acesso Total' : <div className="flex gap-1 flex-wrap">{u.permissions?.create && <span className="bg-emerald-100 text-emerald-800 px-1 rounded">CRIAR</span>}{u.permissions?.edit && <span className="bg-amber-100 text-amber-800 px-1 rounded">ALTERAR</span>}{u.permissions?.delete && <span className="bg-red-100 text-red-800 px-1 rounded">EXCLUIR</span>}</div>}</td>
                <td className="p-3 text-center space-x-3">
                  <button onClick={() => {setEditingUser(u); setIsModalOpen(true);}} className="text-[#5a82b5] hover:text-[#1e5aa0]"><Edit size={16}/></button>
                  {u.id !== appUser.id && <button onClick={() => handleDelete(u)} className="text-red-500 hover:text-red-700"><Trash2 size={16}/></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isCompanyModalOpen && <CompanyModal company={company} onClose={()=>setIsCompanyModalOpen(false)} />}
      {isModalOpen && <UserModal appUser={appUser} projects={projects} editingUser={editingUser} onClose={()=>setIsModalOpen(false)} />}
      {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg('')} />}
      {confirmData && <ConfirmModal message={confirmData.message} onConfirm={confirmData.onConfirm} onCancel={() => setConfirmData(null)} />}
    </div>
  );
}

function CompanyModal({ company, onClose }) {
  const [formData, setFormData] = useState({ 
    nome: company?.nome || '', 
    documento: company?.documento || '', 
    telefone: company?.telefone || '',
    endereco: company?.endereco || ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (company && company.dbId) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'companies', company.dbId), formData);
      onClose();
    } catch(err) { console.error(err); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-[80] backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-lg flex flex-col shadow-2xl">
        <div className="p-4 bg-[#1e5aa0] text-white rounded-t-2xl flex justify-between items-center"><h2 className="font-bold text-lg uppercase">Dados da Empresa</h2><button onClick={onClose}><X size={20}/></button></div>
        <form id="compform" onSubmit={handleSubmit} className="p-6 space-y-4">
          <div><label className="text-xs font-bold text-slate-500 uppercase">Nome da Empresa / Escritório *</label><input required value={formData.nome} onChange={e=>setFormData({...formData, nome: e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none font-bold text-slate-800" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs font-bold text-slate-500 uppercase">CNPJ / CPF</label><input value={formData.documento} onChange={e=>setFormData({...formData, documento: e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none" /></div>
            <div><label className="text-xs font-bold text-slate-500 uppercase">Telefone de Contato</label><input value={formData.telefone} onChange={e=>setFormData({...formData, telefone: e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none" /></div>
          </div>
          <div><label className="text-xs font-bold text-slate-500 uppercase">Endereço Completo</label><input value={formData.endereco} onChange={e=>setFormData({...formData, endereco: e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none" /></div>
        </form>
        <div className="p-4 border-t bg-slate-50 flex justify-end space-x-2 rounded-b-2xl"><button onClick={onClose} type="button" className="px-5 py-2.5 rounded-lg font-bold text-slate-600 hover:bg-slate-200">Cancelar</button><button form="compform" type="submit" className="px-5 py-2.5 rounded-lg font-bold text-white bg-[#1e5aa0] hover:bg-[#154278]">Salvar Dados</button></div>
      </div>
    </div>
  );
}

function UserModal({ appUser, projects, editingUser, onClose }) {
  const [formData, setFormData] = useState(editingUser || {
    nome: '', email: '', senha: '', role: 'operador',
    permissions: { create: false, edit: false, delete: false, screens: ['dashboard'] }, allowedProjects: []
  });

  const toggleScreen = (id) => {
    const s = formData.permissions.screens;
    setFormData({...formData, permissions: {...formData.permissions, screens: s.includes(id) ? s.filter(x=>x!==id) : [...s, id]}});
  };
  const toggleProject = (id) => {
    if (formData.allowedProjects === 'ALL') setFormData({...formData, allowedProjects: [id]});
    else {
      const p = formData.allowedProjects || [];
      setFormData({...formData, allowedProjects: p.includes(id) ? p.filter(x=>x!==id) : [...p, id]});
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = { ...formData, companyId: appUser.companyId };
    if (data.role === 'gestor') { data.permissions = { create: true, edit: true, delete: true, screens: SCREENS.map(s=>s.id) }; data.allowedProjects = 'ALL'; }
    try {
      if (editingUser) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'app_accounts', editingUser.id), data);
      else await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'app_accounts'), data);
      onClose();
    } catch(err) { console.error(err); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-[80] backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="p-4 bg-[#1e5aa0] text-white rounded-t-2xl flex justify-between items-center"><h2 className="font-bold text-lg uppercase">{editingUser ? 'Editar' : 'Novo'} Utilizador</h2><button onClick={onClose}><X size={20}/></button></div>
        <form id="uform" onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><label className="text-xs font-bold text-slate-500 uppercase">Nome Completo</label><input required value={formData.nome} onChange={e=>setFormData({...formData, nome: e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 outline-none mt-1" /></div>
            <div><label className="text-xs font-bold text-slate-500 uppercase">E-mail</label><input required type="email" value={formData.email} onChange={e=>setFormData({...formData, email: e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 outline-none mt-1" disabled={!!editingUser} /></div>
            <div><label className="text-xs font-bold text-slate-500 uppercase">Senha</label><input required type="text" value={formData.senha} onChange={e=>setFormData({...formData, senha: e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 outline-none mt-1" /></div>
            <div className="col-span-2"><label className="text-xs font-bold text-slate-500 uppercase">Cargo</label>
              <select value={formData.role} onChange={e=>setFormData({...formData, role: e.target.value})} className="w-full p-2.5 border rounded-lg bg-white mt-1 outline-none">
                <option value="gestor">Gestor (Acesso Total)</option><option value="operador">Operador (Gerencia)</option><option value="prestador">Prestador (Tarefas e Docs)</option><option value="cliente">Cliente (Apenas visualização)</option>
              </select>
            </div>
          </div>
          {formData.role !== 'gestor' && (
            <div className="space-y-4 border-t pt-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Ecrãs Permitidos</label>
                <div className="flex flex-wrap gap-2">{SCREENS.map(s => <button type="button" key={s.id} onClick={()=>toggleScreen(s.id)} className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${formData.permissions.screens.includes(s.id) ? 'bg-[#1e5aa0] text-white border-[#1e5aa0]' : 'bg-white text-slate-500'}`}>{s.label}</button>)}</div>
              </div>
              <div className="flex gap-4 p-4 bg-slate-50 rounded-xl border">
                <label className="flex items-center gap-2 text-sm font-bold text-slate-700"><input type="checkbox" checked={formData.permissions.create} onChange={e=>setFormData({...formData, permissions: {...formData.permissions, create: e.target.checked}})} className="w-4 h-4" /> Permitir CRIAR</label>
                <label className="flex items-center gap-2 text-sm font-bold text-slate-700"><input type="checkbox" checked={formData.permissions.edit} onChange={e=>setFormData({...formData, permissions: {...formData.permissions, edit: e.target.checked}})} className="w-4 h-4" /> Permitir ALTERAR</label>
                <label className="flex items-center gap-2 text-sm font-bold text-red-700"><input type="checkbox" checked={formData.permissions.delete} onChange={e=>setFormData({...formData, permissions: {...formData.permissions, delete: e.target.checked}})} className="w-4 h-4" /> Permitir EXCLUIR</label>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2"><label className="text-xs font-bold text-slate-500 uppercase">Projetos Permitidos</label><button type="button" onClick={()=>setFormData({...formData, allowedProjects: 'ALL'})} className="text-xs font-bold text-blue-600">Selecionar Todos</button></div>
                <div className="max-h-32 overflow-y-auto border rounded-lg divide-y">
                  {projects.map(p => (
                    <label key={p.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 cursor-pointer text-sm">
                      <input type="checkbox" checked={formData.allowedProjects === 'ALL' || (formData.allowedProjects || []).includes(p.id)} onChange={()=>toggleProject(p.id)} />
                      <span className="font-bold text-slate-700">{p.nomeProjeto}</span><span className="text-xs text-slate-400">({p.clientName})</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </form>
        <div className="p-4 border-t bg-slate-50 flex justify-end space-x-2 rounded-b-2xl"><button onClick={onClose} type="button" className="px-5 py-2 rounded-lg font-bold text-slate-600 hover:bg-slate-200">Cancelar</button><button form="uform" type="submit" className="px-5 py-2 rounded-lg font-bold text-white bg-[#1e5aa0] hover:bg-[#154278]">Salvar</button></div>
      </div>
    </div>
  );
}

// --- DASHBOARD OTIMIZADA COM FOCO EM UX ---
function DashboardView({ projects, checklists, companyUsers, appUser, contasPagar = [], payGroups = [], paySubgroups = [], docTypes = [] }) {
  const totalValue = projects.reduce((sum, p) => sum + Number(p.valorTotal), 0);
  let received = 0, pending = 0;
  projects.forEach(p => (p.parcelas || []).forEach(parc => { if (parc.paga) received += Number(parc.valor); else pending += Number(parc.valor); }));

  // Filtra apenas projetos que realmente estão a rodar
  const activeProjects = projects.filter(p => p.status === 'EM ANDAMENTO');

  const todayStr = getToday();
  const limitDate = new Date(); limitDate.setDate(limitDate.getDate() + 3);
  
  const myTasks = checklists
    .filter(c => !c.concluido && (c.assignedTo === appUser.id || c.assignedTo === 'ALL' || appUser.role === 'gestor') && new Date(c.dataPrevista) <= limitDate)
    .sort((a,b) => new Date(a.dataPrevista) - new Date(b.dataPrevista));

  const overdueTasks = myTasks.filter(t => t.dataPrevista < todayStr);
  const todayTasks = myTasks.filter(t => t.dataPrevista === todayStr);

  // Saudação Dinâmica
  const hours = new Date().getHours();
  const greeting = hours < 12 ? 'Bom dia' : hours < 18 ? 'Boa tarde' : 'Boa noite';

  // --- NOVOS ESTADOS PARA FILTRO DE DESPESAS ---
  const [expenseViewType, setExpenseViewType] = useState('mensal');
  const [expenseFilterMonth, setExpenseFilterMonth] = useState(new Date().getMonth() + 1); // 1-12
  const [expenseFilterYear, setExpenseFilterYear] = useState(new Date().getFullYear());

  // --- RESUMO FINANCEIRO (PAGAMENTOS) PARA OS GRÁFICOS ---
  const groupStats = useMemo(() => {
    const stats = {};
    (contasPagar || []).forEach(c => {
      const g = payGroups.find(x => x.id === c.grupoId)?.nome || 'Outros';
      const sg = paySubgroups.find(x => x.id === c.subgrupoId)?.nome || 'Sem Categoria';
      (c.parcelas || []).forEach(p => {
        if (!p.dataVencimento) return;
        const [pYear, pMonth] = p.dataVencimento.split('-').map(Number);
        
        const matchesYear = pYear === Number(expenseFilterYear);
        const matchesMonth = pMonth === Number(expenseFilterMonth);

        const match = expenseViewType === 'mensal' ? (matchesYear && matchesMonth) : matchesYear;
        if (!match) return;

        if (!stats[g]) stats[g] = { paid: 0, pending: 0, subs: {} };
        if (!stats[g].subs[sg]) stats[g].subs[sg] = { paid: 0, pending: 0 };

        const val = Number(p.valor) || 0;
        if (p.status === 'pago') { stats[g].paid += val; stats[g].subs[sg].paid += val; }
        else { stats[g].pending += val; stats[g].subs[sg].pending += val; }
      });
    });
    return stats;
  }, [contasPagar, payGroups, paySubgroups, expenseViewType, expenseFilterMonth, expenseFilterYear]);

  const bankStats = useMemo(() => {
    const stats = {};
    const currentMonthKey = getToday().substring(0, 7);
    const faturaTypeIds = (docTypes || []).filter(t => t.isFatura).map(t => t.id);
    (contasPagar || []).forEach(c => {
      if (!faturaTypeIds.includes(c.tipoDocumentoId) || !c.banco) return;
      (c.parcelas || []).forEach(p => {
        if (!p.dataVencimento) return;
        if (p.dataVencimento.substring(0, 7) !== currentMonthKey) return;
        if (!stats[c.banco]) stats[c.banco] = 0;
        stats[c.banco] += Number(p.valor) || 0;
      });
    });
    return stats;
  }, [contasPagar, docTypes]);

  const bankTotal = useMemo(() => Object.values(bankStats).reduce((sum, v) => sum + v, 0), [bankStats]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* CABEÇALHO DE BOAS VINDAS E ALERTA */}
      <div className="bg-gradient-to-r from-[#1e5aa0] to-[#154278] rounded-2xl p-6 sm:p-8 text-white shadow-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 opacity-10 pointer-events-none"><Building2 size={200} /></div>
        <div className="z-10">
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight">{greeting}, {appUser.nome.split(' ')[0]}! 👋</h2>
          <p className="text-blue-100 mt-1 font-medium text-sm">Resumo do escritório para hoje, {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}.</p>
        </div>
        <div className="z-10 bg-white/10 backdrop-blur-md px-5 py-3 rounded-xl border border-white/20 flex items-center gap-3">
          <div className={`${overdueTasks.length > 0 ? 'bg-red-500 animate-pulse' : 'bg-amber-500'} p-2 rounded-lg shadow-inner`}>
            <AlertCircle className="text-white" size={24}/>
          </div>
          <div>
            <p className="text-[10px] font-black text-blue-100 uppercase tracking-widest">Atenção Requerida</p>
            <p className="font-black text-lg leading-tight">{overdueTasks.length + todayTasks.length} tarefas urgentes</p>
          </div>
        </div>
      </div>

      {/* CARTÕES DE KPI (INDICADORES) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Valor em Contratos" subtitle={`${activeProjects.length} obras em andamento`} value={formatCurrency(totalValue)} icon={<Wallet size={24} />} color="blue" />
        <StatCard title="Receita Realizada" subtitle="Total faturado até o momento" value={formatCurrency(received)} icon={<TrendingUp size={24} />} color="emerald" />
        <StatCard title="A Receber" subtitle="Inadimplência ou a vencer" value={formatCurrency(pending)} icon={<CalendarDays size={24} />} color="amber" />
        <StatCard title="Volume de Projetos" subtitle="Contratos ativos no painel" value={activeProjects.length} icon={<FolderKanban size={24} />} color="indigo" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* ACOMPANHAMENTO DE PROJETOS ATIVOS */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[420px]">
          <div className="flex justify-between items-end border-b border-slate-100 pb-3 mb-4 shrink-0">
            <div>
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Status das Obras Ativas</h3>
              <p className="text-xs font-bold text-slate-400">Acompanhamento do progresso das fases</p>
            </div>
          </div>
          <div className="overflow-y-auto space-y-4 pr-2 custom-scrollbar">
            {activeProjects.map(p => {
              const currentFaseIndex = FASES_ANALITICAS.indexOf(p.faseAnalitica || 'LEVANTAMENTO');
              const percent = Math.round(((currentFaseIndex + 1) / FASES_ANALITICAS.length) * 100);
              return (
                <div key={p.id} className="group border border-slate-100 p-4 rounded-xl hover:border-blue-200 hover:shadow-md transition-all bg-slate-50 hover:bg-white relative overflow-hidden">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1 min-w-0 pr-4">
                      <p className="font-black text-slate-800 text-sm truncate group-hover:text-[#1e5aa0] transition-colors">{p.nomeProjeto}</p>
                      <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1"><Users size={12}/> {p.clientName}</p>
                    </div>
                    <span className="text-[9px] px-2.5 py-1 rounded-md font-black bg-blue-100 text-blue-800 shrink-0 uppercase tracking-widest border border-blue-200">{p.faseAnalitica || 'LEVANTAMENTO'}</span>
                  </div>
                  <div className="flex justify-between text-[10px] mb-1.5 font-black uppercase text-slate-400">
                    <span>Progresso Geral</span>
                    <span className="text-[#1e5aa0]">{percent}%</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-400 to-[#1e5aa0] h-full rounded-full transition-all duration-1000" style={{width: `${percent}%`}}></div>
                  </div>
                </div>
              );
            })}
            {activeProjects.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 pt-10">
                <FolderOpen size={48} className="mb-3 opacity-20"/>
                <p className="text-sm font-medium">Nenhum projeto ativo no momento.</p>
              </div>
            )}
          </div>
        </div>

        {/* TAREFAS COM INDICADORES DE URGÊNCIA */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[420px]">
          <div className="flex justify-between items-end border-b border-slate-100 pb-3 mb-4 shrink-0">
            <div>
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Painel de Pendências</h3>
              <p className="text-xs font-bold text-slate-400">Próximos 3 dias e urgências da sua equipe</p>
            </div>
          </div>
          <div className="overflow-y-auto space-y-3 pr-2 custom-scrollbar">
            {myTasks.map(chk => {
              const p = projects.find(proj => proj.id === chk.projectId);
              const isLate = chk.dataPrevista < todayStr;
              const isToday = chk.dataPrevista === todayStr;
              
              let badgeColor = "bg-slate-100 text-slate-600 border-slate-200";
              let dotColor = "bg-slate-300";
              let statusText = "Em breve";
              
              if (isLate) { badgeColor = "bg-red-50 text-red-700 border-red-200"; dotColor = "bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]"; statusText = "Atrasada"; }
              else if (isToday) { badgeColor = "bg-amber-50 text-amber-700 border-amber-200"; dotColor = "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]"; statusText = "Hoje"; }

              return (
                <div key={chk.id} className="p-4 bg-white rounded-xl border border-slate-100 flex gap-4 items-center hover:shadow-md transition-shadow group">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColor}`}></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-slate-800 truncate group-hover:text-[#1e5aa0] transition-colors">{chk.descricao}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 truncate flex items-center gap-1"><FolderKanban size={10}/> {p?.nomeProjeto || 'Geral'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded border ${badgeColor}`}>
                      {statusText}
                    </span>
                    <div className="text-xs font-bold text-slate-500 mt-1.5 flex items-center justify-end gap-1">
                      <Clock size={12} className={isLate ? 'text-red-500' : ''}/>
                      <span className={isLate ? 'text-red-600' : ''}>{formatDate(chk.dataPrevista)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {myTasks.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 pt-10">
                <CheckCircle2 size={48} className="mb-3 text-emerald-400 opacity-40"/>
                <p className="text-sm font-medium text-slate-500">Tudo em dia! Nenhuma pendência urgente.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* GRÁFICO RESUMO POR GRUPO E SUBGRUPO */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="border-b border-slate-100 pb-3 mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Despesas por Categoria</h3>
              <p className="text-xs font-bold text-slate-400">Total Pago (Verde) vs Pendente (Vermelho)</p>
            </div>

            <div className="flex items-center gap-2">
              <select 
                value={expenseViewType} 
                onChange={e => setExpenseViewType(e.target.value)}
                className="text-[10px] font-black border rounded p-1 outline-none bg-slate-50 uppercase"
              >
                <option value="mensal">Mensal</option>
                <option value="anual">Anual</option>
              </select>
              
              {expenseViewType === 'mensal' && (
                <select 
                  value={expenseFilterMonth} 
                  onChange={e => setExpenseFilterMonth(Number(e.target.value))}
                  className="text-[10px] font-black border rounded p-1 outline-none bg-slate-50 uppercase"
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {new Date(0, i).toLocaleString('pt-BR', { month: 'long' })}
                    </option>
                  ))}
                </select>
              )}

              <input 
                type="number" 
                value={expenseFilterYear} 
                onChange={e => setExpenseFilterYear(Number(e.target.value))}
                className="w-16 text-[10px] font-black border rounded p-1 outline-none bg-slate-50 text-center"
                placeholder="Ano"
              />
            </div>
          </div>
          <div className="space-y-6 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {Object.entries(groupStats).map(([gName, data]) => {
              const total = data.paid + data.pending;
              const paidPercent = total > 0 ? (data.paid / total) * 100 : 0;
              return (
                <div key={gName} className="space-y-2">
                  <div className="flex justify-between items-end">
                    <span className="text-xs font-black text-slate-700 uppercase">{gName}</span>
                    <span className="text-[10px] font-bold text-slate-400">{formatCurrency(total)}</span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
                    <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${paidPercent}%` }}></div>
                    <div className="bg-red-400 h-full transition-all duration-500" style={{ width: `${100 - paidPercent}%` }}></div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 pl-2">
                    {Object.entries(data.subs).map(([sgName, sgData]) => (
                      <div key={sgName} className="flex justify-between text-[10px] border-l-2 border-slate-100 pl-2">
                        <span className="text-slate-500 font-bold truncate pr-2">{sgName}</span>
                        <span className="text-slate-800 font-black shrink-0">{formatCurrency(sgData.paid + sgData.pending)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* VALOR DA FATURA POR BANCO (MENSAL) */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="border-b border-slate-100 pb-3 mb-4 flex justify-between items-center">
            <div>
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Faturas Mensais por Banco</h3>
              <p className="text-xs font-bold text-slate-400">Mês atual: {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p>
            </div>
            <Briefcase className="text-slate-300" size={24}/>
          </div>
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {Object.keys(bankStats).length > 0 ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.entries(bankStats).map(([bank, value]) => (
                    <div key={bank} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                      <p className="text-[10px] font-black text-slate-400 uppercase truncate mb-0.5">{bank}</p>
                      <p className="font-black text-slate-800">{formatCurrency(value)}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex justify-between items-center mt-2">
                  <span className="text-xs font-black text-blue-800 uppercase">Total das Faturas</span>
                  <span className="text-lg font-black text-blue-900">{formatCurrency(bankTotal)}</span>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <Briefcase size={40} className="opacity-20 mb-2"/>
                <p className="text-xs font-bold uppercase">Nenhuma fatura para este mês</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Subcomponente dos Cartões Superiores
function StatCard({ title, subtitle, value, icon, color }) {
  const styles = {
    blue: { bg: 'bg-blue-600', text: 'text-blue-100' },
    emerald: { bg: 'bg-emerald-600', text: 'text-emerald-100' },
    amber: { bg: 'bg-amber-500', text: 'text-amber-100' },
    indigo: { bg: 'bg-indigo-600', text: 'text-indigo-100' }
  };
  
  const theme = styles[color];

  return (
    <div className={`${theme.bg} p-5 rounded-2xl shadow-md flex items-center space-x-4 relative overflow-hidden transition-transform hover:-translate-y-1`}>
      {/* Ícone de fundo marca d'água */}
      <div className="absolute -right-4 -top-4 opacity-10 transform rotate-12 scale-150 pointer-events-none text-white">
        {icon}
      </div>
      <div className={`p-3 rounded-xl bg-white/20 text-white shrink-0 z-10 shadow-inner backdrop-blur-sm`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0 z-10">
        <p className={`text-[10px] font-black uppercase tracking-widest ${theme.text} opacity-90`}>{title}</p>
        <p className="text-xl sm:text-2xl font-black text-white truncate my-0.5 leading-tight">{value}</p>
        <p className={`text-[9px] font-bold ${theme.text} opacity-80 truncate uppercase tracking-wide`}>{subtitle}</p>
      </div>
    </div>
  );
}

function ClientModal({ appUser, client, onClose }) {
  const [formData, setFormData] = useState(client || { nome: '', telefone: '', email: '', documento: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' });
  
  const handleCepBlur = async (e) => {
    const cep = e.target.value.replace(/\D/g, '');
    if(cep.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await res.json();
        if(!data.erro) setFormData(prev => ({...prev, logradouro: data.logradouro, bairro: data.bairro, cidade: data.localidade, uf: data.uf}));
      } catch(err) { console.error(err); }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = { ...formData, companyId: appUser.companyId };
    try {
      if (client) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clients', client.id), data);
      else await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'clients'), data);
      onClose();
    } catch (e) { console.error(e); }
  };
  
  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-[80] backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-2xl flex flex-col shadow-2xl max-h-[90vh]">
        <div className="p-4 bg-[#1e5aa0] text-white rounded-t-2xl flex justify-between items-center"><h2 className="font-bold text-lg uppercase">{client ? 'Editar' : 'Novo'} Cliente</h2><button onClick={onClose}><X size={20}/></button></div>
        <form id="cform" onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
          <div><label className="text-xs font-bold text-slate-500 uppercase">Nome *</label><input required value={formData.nome} onChange={e=>setFormData({...formData, nome:e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none font-bold text-slate-800" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs font-bold text-slate-500 uppercase">Telefone</label><input value={formData.telefone} onChange={e=>setFormData({...formData, telefone:e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none" /></div>
            <div><label className="text-xs font-bold text-slate-500 uppercase">CPF / CNPJ</label><input type="text" value={maskCPFCNPJ(formData.documento)} onChange={e=>setFormData({...formData, documento:e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none" /></div>
          </div>
          <div><label className="text-xs font-bold text-slate-500 uppercase">E-mail</label><input type="email" value={formData.email} onChange={e=>setFormData({...formData, email:e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none" /></div>
          
          <div className="border-t pt-4 mt-2"><h4 className="font-bold text-slate-700 uppercase text-sm">Endereço do Cliente</h4></div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-1"><label className="text-xs font-bold text-slate-500 uppercase">CEP</label><input type="text" value={maskCEP(formData.cep)} onChange={e=>setFormData({...formData, cep:e.target.value})} onBlur={handleCepBlur} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none" placeholder="00000-000" /></div>
            <div className="sm:col-span-2"><label className="text-xs font-bold text-slate-500 uppercase">Logradouro / Rua</label><input value={formData.logradouro} onChange={e=>setFormData({...formData, logradouro:e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none" /></div>
            <div className="sm:col-span-1"><label className="text-xs font-bold text-slate-500 uppercase">Número</label><input value={formData.numero} onChange={e=>setFormData({...formData, numero:e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none" /></div>
            <div className="sm:col-span-1"><label className="text-xs font-bold text-slate-500 uppercase">Complemento</label><input value={formData.complemento} onChange={e=>setFormData({...formData, complemento:e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none" /></div>
            <div className="sm:col-span-1"><label className="text-xs font-bold text-slate-500 uppercase">Bairro</label><input value={formData.bairro} onChange={e=>setFormData({...formData, bairro:e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none" /></div>
            <div className="sm:col-span-1"><label className="text-xs font-bold text-slate-500 uppercase">Cidade</label><input value={formData.cidade} onChange={e=>setFormData({...formData, cidade:e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none" /></div>
            <div className="sm:col-span-1"><label className="text-xs font-bold text-slate-500 uppercase">UF</label><input value={formData.uf} onChange={e=>setFormData({...formData, uf:e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none uppercase" maxLength="2" /></div>
          </div>
        </form>
        <div className="p-4 border-t bg-slate-50 flex justify-end space-x-2 rounded-b-2xl"><button onClick={onClose} type="button" className="px-5 py-2.5 rounded-lg font-bold text-slate-600 hover:bg-slate-200">Cancelar</button><button form="cform" type="submit" className="px-5 py-2.5 rounded-lg font-bold text-white bg-[#1e5aa0] hover:bg-[#154278]">Salvar</button></div>
      </div>
    </div>
  );
}

// --- PROJETOS E DETALHAMENTOS GERAIS ---
function ProjetosView({ projects, clients, companyUsers, targetProject, clearTargetProject, canCreate, canEdit, canDelete, appUser, documents, checklists }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [detailingProject, setDetailingProject] = useState(null); 
  const [activeTab, setActiveTab] = useState('ativos');
  const [alertMsg, setAlertMsg] = useState('');
  const [confirmData, setConfirmData] = useState(null);
  
  useEffect(() => { if (targetProject) { setEditingProject(targetProject); setIsModalOpen(true); clearTargetProject(); } }, [targetProject]);

  const handleDelete = (p) => {
    if (p.parcelas?.some(x => x.paga)) return setAlertMsg("Projeto possui pagamentos baixados. Não é possível excluir.");
    setConfirmData({
      message: "Excluir projeto permanentemente?",
      onConfirm: async () => {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', p.id));
        setConfirmData(null);
      }
    });
  };

  const projetosAtivos = projects.filter(p => p.status !== 'ENTREGUE');
  const projetosFinalizados = projects.filter(p => p.status === 'ENTREGUE');
  const currentList = activeTab === 'ativos' ? projetosAtivos : projetosFinalizados;

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Projetos</h3>
        {canCreate && <button onClick={() => {setEditingProject(null); setIsModalOpen(true);}} className="bg-[#1e5aa0] text-white px-4 py-2.5 rounded-lg font-bold flex items-center space-x-2 shadow-sm hover:bg-[#154278]"><Plus size={18}/><span>Lançar Projeto</span></button>}
      </div>

      <div className="flex gap-4 mb-4 border-b border-slate-200 shrink-0">
        <button onClick={() => setActiveTab('ativos')} className={`pb-3 px-2 text-sm font-black uppercase tracking-wide border-b-2 transition-colors ${activeTab === 'ativos' ? 'border-[#1e5aa0] text-[#1e5aa0]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
          Em Andamento ({projetosAtivos.length})
        </button>
        <button onClick={() => setActiveTab('finalizados')} className={`pb-3 px-2 text-sm font-black uppercase tracking-wide border-b-2 transition-colors ${activeTab === 'finalizados' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
          Projetos Finalizados ({projetosFinalizados.length})
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 overflow-auto">
        <table className="w-full text-left text-sm min-w-[800px]">
          <thead className="bg-[#5a82b5] text-white text-xs uppercase sticky top-0 z-10"><tr><th className="p-4">Projeto</th><th className="p-4">Responsável</th><th className="p-4 text-center">Status</th><th className="p-4 text-center">Detalhamento da Obra</th><th className="p-4 text-right">Valor do Projeto</th><th className="p-4 text-center">Ações</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {currentList.map(p => {
              const resp = companyUsers.find(u => u.id === p.responsavelId);
              return (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="p-4"><p className="font-bold text-slate-800">{p.nomeProjeto}</p><p className="text-xs text-slate-500">{p.clientName}</p></td>
                  <td className="p-4 font-bold text-xs text-slate-600 uppercase flex items-center gap-2 mt-2"><Briefcase size={14}/> {resp?.nome || 'Não Atribuído'}</td>
                  <td className="p-4 text-center"><span className={`px-3 py-1 rounded-full font-bold text-[10px] ${p.status === 'ENTREGUE' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>{p.status}</span></td>
                  <td className="p-4 text-center">
                    <button onClick={() => setDetailingProject(p)} className="bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100 px-3 py-1.5 rounded-lg flex items-center justify-center space-x-1 mx-auto transition-colors font-bold text-xs uppercase">
                      <LayoutList size={16} /> <span>Checklist / Custos</span>
                    </button>
                  </td>
                  <td className="p-4 text-right font-black text-slate-700">{formatCurrency(p.valorTotal)}</td>
                  <td className="p-4 text-center space-x-3">
                    {canEdit && <button onClick={() => {setEditingProject(p); setIsModalOpen(true);}} className="text-[#5a82b5] hover:text-[#1e5aa0]"><Edit size={16}/></button>}
                    {canDelete && <button onClick={() => handleDelete(p)} className="text-red-500 hover:text-red-700"><Trash2 size={16}/></button>}
                  </td>
                </tr>
              )
            })}
            {currentList.length === 0 && <tr><td colSpan="6" className="text-center py-8 text-slate-400 font-medium">Nenhum projeto nesta categoria.</td></tr>}
          </tbody>
        </table>
      </div>
      
      {isModalOpen && <ProjectModal appUser={appUser} clients={clients} companyUsers={companyUsers} project={editingProject} onClose={()=>setIsModalOpen(false)} />}
      {detailingProject && <ProjectDetailingModal appUser={appUser} project={detailingProject} documents={documents} checklists={checklists} onClose={()=>setDetailingProject(null)} />}
      
      {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg('')} />}
      {confirmData && <ConfirmModal message={confirmData.message} onConfirm={confirmData.onConfirm} onCancel={() => setConfirmData(null)} />}
    </div>
  );
}

// MODAL DE DETALHAMENTO DE PROJETO (CHECKLIST E AMBIENTES)
function ProjectDetailingModal({ appUser, project, documents, checklists, onClose }) {
  const [activeTab, setActiveTab] = useState('geral');
  const [formData, setFormData] = useState({ briefing: project.briefing || '', estiloProjeto: project.estiloProjeto || '', ambientes: project.ambientes || [] });
  const [editingEnvIndex, setEditingEnvIndex] = useState(null);
  const [saving, setSaving] = useState(false);
  const [alertMsg, setAlertMsg] = useState('');
  
  const [envPromptOpen, setEnvPromptOpen] = useState(false);
  const [tempEnvName, setTempEnvName] = useState('');

  const projectDocs = documents.filter(d => d.projectId === project.id);
  const plantas = projectDocs.filter(d => d.docType === 'planta_humanizada');
  const refGerais = projectDocs.filter(d => d.docType === 'referencia_geral');

  const orcamentosVinculados = checklists.filter(c => c.projectId === project.id).flatMap(c => (c.budgets || []).filter(b => b.approved || b.done).map(b => ({ ...b, checklistName: c.descricao })));
  const totalOrcamentos = orcamentosVinculados.reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);

  const totalItensAmbientes = formData.ambientes.reduce((accEnv, env) => {
    return accEnv + env.itens.reduce((accItem, item) => accItem + ((Number(item.valor) || 0) * (Number(item.quantidade) || 1)), 0);
  }, 0);

  const custoTotalObra = (Number(project.valorTotal) || 0) + totalOrcamentos + totalItensAmbientes;

  const handleUploadSpecial = async (e, type, ambienteId = null, itemId = null) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      if (file.size > 1048000) { setAlertMsg(`O arquivo ${file.name} excede 1MB.`); continue; }
      const reader = new FileReader();
      reader.onload = async (ev) => {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'documents'), {
          companyId: appUser.companyId, projectId: project.id, uploadedBy: appUser.id,
          nome: file.name, tipo: file.type, tamanho: file.size, dataUpload: new Date().toISOString(),
          conteudoBase64: ev.target.result, docType: type, ambienteId, itemId
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveGeneral = async () => {
    setSaving(true);
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', project.id), { briefing: formData.briefing, estiloProjeto: formData.estiloProjeto, ambientes: formData.ambientes });
    setSaving(false);
    setAlertMsg('Salvo com sucesso!');
  };

  const addEnvironment = () => {
    setTempEnvName('');
    setEnvPromptOpen(true);
  };

  const confirmAddEnvironment = (e) => {
    e.preventDefault();
    if(!tempEnvName.trim()) return;
    const newEnv = { id: generateId(), nome: tempEnvName, detalhes: '', estilo: '', usarEstiloGeral: false, itens: [] };
    setFormData({...formData, ambientes: [...formData.ambientes, newEnv]});
    setEditingEnvIndex(formData.ambientes.length);
    setEnvPromptOpen(false);
  };

  const deleteEnvironment = (idx) => {
    if(window.confirm("Excluir ambiente completo?")) {
      const updated = [...formData.ambientes]; updated.splice(idx, 1);
      setFormData({...formData, ambientes: updated});
    }
  };

  const generateReport = () => {
    const html = `
      <h1>Relatório de Custos da Obra - ${project.nomeProjeto}</h1>
      <p><strong>Cliente:</strong> ${project.clientName}</p>
      <p><strong>Data do Relatório:</strong> ${formatDate(getToday())}</p>
      
      <h2>1. Valor do Projeto / Contrato</h2>
      <p>Custo do Serviço de Arquitetura: <strong>${formatCurrency(project.valorTotal)}</strong></p>

      <h2>2. Detalhamento por Ambientes (Itens Cadastrados)</h2>
      ${formData.ambientes.length === 0 ? '<p>Nenhum ambiente detalhado.</p>' : formData.ambientes.map(env => `
        <h3 style="color:#0369a1; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-top:20px;">Ambiente: ${env.nome}</h3>
        ${env.itens.length === 0 ? '<p>Nenhum material/item lançado.</p>' : `
          <table>
            <tr><th>Categoria</th><th>Item</th><th>Marca/Modelo</th><th>Qtd</th><th>Valor Unit.</th><th>Total Item</th></tr>
            ${env.itens.map(it => `
              <tr>
                <td>${it.categoria}</td>
                <td>${it.nome}</td>
                <td>${it.marca} ${it.modelo ? ' - ' + it.modelo : ''}</td>
                <td>${it.quantidade || 1}</td>
                <td>${formatCurrency(it.valor || 0)}</td>
                <td>${formatCurrency((it.valor || 0) * (it.quantidade || 1))}</td>
              </tr>
            `).join('')}
          </table>
        `}
      `).join('')}

      <h2>3. Orçamentos de Tarefas/Serviços (Aprovados na Obra)</h2>
      ${orcamentosVinculados.length === 0 ? '<p>Nenhum orçamento extra aprovado.</p>' : `
        <table>
          <tr><th>Fornecedor/Profissional</th><th>Serviço/Tarefa</th><th>Valor</th></tr>
          ${orcamentosVinculados.map(o => `
            <tr>
              <td>${o.professionalName}</td>
              <td>${o.checklistName} - ${o.obs}</td>
              <td>${formatCurrency(o.value)}</td>
            </tr>
          `).join('')}
        </table>
      `}

      <div style="text-align:right; margin-top: 15px; font-size: 16px; color: #555;">Subtotal Itens dos Ambientes: <strong>${formatCurrency(totalItensAmbientes)}</strong></div>
      <div class="total-box">
        Custo Total Estimado da Obra: <span>${formatCurrency(custoTotalObra)}</span>
      </div>
    `;
    printReport(`Relatorio_Obra_${project.nomeProjeto.replace(/\s+/g,'_')}`, html);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-[70]">
      <div className="bg-white rounded-2xl w-full max-w-6xl shadow-2xl flex flex-col h-[95vh] sm:h-[90vh]">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-[#1e5aa0] text-white rounded-t-2xl shrink-0">
          <div><h2 className="text-lg font-bold uppercase tracking-wide flex items-center gap-2"><LayoutList size={20}/> Checklist Detalhado da Obra</h2><p className="text-blue-200 text-xs font-bold mt-1">{project.nomeProjeto}</p></div>
          <div className="flex gap-2"><button onClick={generateReport} className="bg-white text-[#1e5aa0] hover:bg-slate-100 p-2 rounded-lg font-bold text-xs uppercase flex items-center gap-1 shadow"><Printer size={16}/> Relatório Custos</button><button onClick={onClose} className="p-2 hover:bg-blue-800 rounded-lg"><X size={20}/></button></div>
        </div>
        
        <div className="flex bg-slate-50 border-b border-slate-200 shrink-0 px-4 overflow-x-auto">
          <button onClick={()=>{setActiveTab('geral'); setEditingEnvIndex(null);}} className={`px-4 py-3 text-xs font-black uppercase tracking-wide border-b-2 transition-colors whitespace-nowrap ${activeTab === 'geral' ? 'border-[#1e5aa0] text-[#1e5aa0]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>Inf. Gerais do Projeto</button>
          <button onClick={()=>setActiveTab('ambientes')} className={`px-4 py-3 text-xs font-black uppercase tracking-wide border-b-2 transition-colors whitespace-nowrap ${activeTab === 'ambientes' ? 'border-[#1e5aa0] text-[#1e5aa0]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>Ambientes ({formData.ambientes.length})</button>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-100">
          {activeTab === 'geral' && (
            <div className="p-6 max-w-4xl mx-auto space-y-6">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="font-black text-[#1e5aa0] uppercase text-sm mb-4 border-b pb-2">Identidade do Projeto</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2"><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nome do Cliente</label><input type="text" disabled value={project.clientName} className="w-full p-2.5 bg-slate-100 border rounded-lg font-bold text-slate-700" /></div>
                  <div className="md:col-span-2"><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Estilo do Projeto (Ex: Industrial, Minimalista)</label><input type="text" value={formData.estiloProjeto} onChange={e=>setFormData({...formData, estiloProjeto: e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 outline-none font-bold" /></div>
                  <div className="md:col-span-2"><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Briefing Completo do Cliente/Projeto</label><textarea rows="4" value={formData.briefing} onChange={e=>setFormData({...formData, briefing: e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 outline-none resize-none font-medium text-sm"></textarea></div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="font-black text-slate-700 uppercase text-sm mb-4 flex justify-between items-center">Planta Humanizada <label className="bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded text-xs cursor-pointer hover:bg-indigo-100"><Upload size={14} className="inline mr-1"/> Upload<input type="file" className="hidden" onChange={(e)=>handleUploadSpecial(e, 'planta_humanizada')} /></label></h3>
                  <div className="grid grid-cols-2 gap-2">
                    {plantas.map(d => <div key={d.id} className="relative group border rounded p-1"><button onClick={()=>deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'documents', d.id))} className="absolute top-1 right-1 bg-red-500 text-white rounded p-1 opacity-0 group-hover:opacity-100"><Trash2 size={12}/></button><img src={d.conteudoBase64} alt={d.nome} className="w-full h-24 object-cover rounded" /></div>)}
                    {plantas.length===0 && <div className="col-span-2 text-center text-slate-400 py-8 border border-dashed rounded bg-slate-50 text-xs">Nenhuma planta anexada</div>}
                  </div>
                </div>
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="font-black text-slate-700 uppercase text-sm mb-4 flex justify-between items-center">Referências (Inspirações) <label className="bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded text-xs cursor-pointer hover:bg-indigo-100"><Upload size={14} className="inline mr-1"/> Upload<input type="file" multiple className="hidden" onChange={(e)=>handleUploadSpecial(e, 'referencia_geral')} /></label></h3>
                  <div className="grid grid-cols-3 gap-2">
                    {refGerais.map(d => <div key={d.id} className="relative group border rounded p-1"><button onClick={()=>deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'documents', d.id))} className="absolute top-1 right-1 bg-red-500 text-white rounded p-1 opacity-0 group-hover:opacity-100"><Trash2 size={12}/></button><img src={d.conteudoBase64} alt={d.nome} className="w-full h-16 object-cover rounded" /></div>)}
                    {refGerais.length===0 && <div className="col-span-3 text-center text-slate-400 py-8 border border-dashed rounded bg-slate-50 text-xs">Nenhuma inspiração anexada</div>}
                  </div>
                </div>
              </div>
              <div className="text-right"><button onClick={handleSaveGeneral} className="bg-[#1e5aa0] text-white px-6 py-3 rounded-lg font-bold shadow-md hover:bg-[#154278] uppercase">{saving ? 'A Guardar...' : 'Guardar Informações Gerais'}</button></div>
            </div>
          )}

          {activeTab === 'ambientes' && editingEnvIndex === null && (
            <div className="p-6">
              <div className="flex justify-between items-center mb-6"><h3 className="font-black text-slate-700 uppercase">Ambientes Cadastrados</h3><button onClick={addEnvironment} className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold text-xs uppercase flex items-center gap-1 shadow-sm"><Plus size={16}/> Adicionar Ambiente</button></div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {formData.ambientes.map((env, idx) => {
                  const envTotal = env.itens.reduce((sum, item) => sum + ((Number(item.valor)||0) * (Number(item.quantidade)||1)), 0);
                  const categoriasPreenchidas = [...new Set(env.itens.map(i => i.categoria))];
                  return (
                    <div key={env.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-[#1e5aa0] transition-all cursor-pointer relative group" onClick={()=>{setEditingEnvIndex(idx); handleSaveGeneral();}}>
                      <button onClick={(e)=>{e.stopPropagation(); deleteEnvironment(idx);}} className="absolute top-3 right-3 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 size={16}/></button>
                      <div className="flex items-center gap-3 mb-3"><div className="bg-indigo-50 p-2 rounded-lg text-indigo-600"><Sofa size={24}/></div><div><h4 className="font-black text-slate-800 uppercase leading-tight">{env.nome}</h4><p className="text-[10px] font-bold text-slate-500">{env.itens.length} itens detalhados</p></div></div>
                      <div className="flex flex-wrap gap-1 mb-4 h-12 overflow-hidden">{categoriasPreenchidas.map(c => <span key={c} className="text-[9px] bg-slate-100 border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-black uppercase">{c}</span>)}{categoriasPreenchidas.length===0 && <span className="text-[10px] text-slate-400 italic">Nenhum item adicionado</span>}</div>
                      <div className="border-t pt-3 flex justify-between items-center"><span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Estimativa Total:</span><span className="font-black text-[#1e5aa0]">{formatCurrency(envTotal)}</span></div>
                    </div>
                  );
                })}
                {formData.ambientes.length === 0 && <div className="col-span-full text-center py-12 text-slate-400 font-medium">Nenhum ambiente adicionado ao projeto ainda.</div>}
              </div>
            </div>
          )}

          {activeTab === 'ambientes' && editingEnvIndex !== null && (
            <EnvironmentEditor env={formData.ambientes[editingEnvIndex]} project={project} appUser={appUser} allDocs={documents}
              onSave={(updatedEnv) => {
                const novas = [...formData.ambientes]; novas[editingEnvIndex] = updatedEnv;
                setFormData({...formData, ambientes: novas});
                updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', project.id), { ambientes: novas });
              }} 
              onBack={() => setEditingEnvIndex(null)}
              globalStyle={formData.estiloProjeto}
              onUpload={(e, type, itemId) => handleUploadSpecial(e, type, formData.ambientes[editingEnvIndex].id, itemId)}
            />
          )}
        </div>
      </div>
      
      {envPromptOpen && (
        <div className="fixed inset-0 bg-slate-900/80 flex items-center justify-center p-4 z-[90] backdrop-blur-sm">
          <div className="bg-white rounded-xl w-full max-w-sm flex flex-col shadow-2xl overflow-hidden">
             <div className="p-4 bg-[#1e5aa0] text-white font-bold flex justify-between items-center uppercase text-sm">Nome do Novo Ambiente <button onClick={()=>setEnvPromptOpen(false)}><X size={18}/></button></div>
             <form onSubmit={confirmAddEnvironment} className="p-6 flex flex-col gap-4">
                <input autoFocus required type="text" placeholder="Ex: Quarto Casal, Cozinha..." value={tempEnvName} onChange={(e)=>setTempEnvName(e.target.value)} className="w-full border p-3 rounded-lg outline-none focus:ring-2 focus:ring-[#1e5aa0] font-bold text-slate-700" />
                <button type="submit" className="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl hover:bg-emerald-700 shadow-md">Criar Ambiente</button>
             </form>
          </div>
        </div>
      )}

      {alertMsg && <AlertModal message={alertMsg} onClose={()=>setAlertMsg('')}/>}
    </div>
  );
}

function EnvironmentEditor({ env, project, appUser, allDocs, onSave, onBack, globalStyle, onUpload }) {
  const [localEnv, setLocalEnv] = useState(env);
  const [activeCat, setActiveCat] = useState(CATEGORIAS_AMBIENTE[0]);
  const [itemForm, setItemForm] = useState({ nome: '', marca: '', modelo: '', codigo: '', valor: '', quantidade: 1 });
  const [zoomedImage, setZoomedImage] = useState(null);

  // 1. NOVO ESTADO: Armazena o ID do item que está sendo editado
  const [editingItemId, setEditingItemId] = useState(null);

  const envDocs = allDocs.filter(d => d.ambienteId === localEnv.id);
  const refAmbiente = envDocs.filter(d => d.docType === 'referencia_ambiente');

  const updateField = (field, val) => {
    const updated = {...localEnv, [field]: val};
    setLocalEnv(updated); onSave(updated);
  };

  // 2. FUNÇÃO CARREGAR EDIÇÃO: Preenche o formulário com os dados do item
  const handleEditItem = (item) => {
    setItemForm({
      nome: item.nome,
      marca: item.marca || '',
      modelo: item.modelo || '',
      codigo: item.codigo || '',
      valor: item.valor || '',
      quantidade: item.quantidade || 1
    });
    setEditingItemId(item.id);
    // Rola para o topo do formulário para facilitar a visualização no celular
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 3. FUNÇÃO SALVAR ALTERADA: Agora lida com Adição e Edição
  const handleSaveItem = (e) => {
    e.preventDefault();
    if(!itemForm.nome) return;
    
    let updatedItemsList;

    if (editingItemId) {
      // Lógica de Atualização
      updatedItemsList = localEnv.itens.map(it => 
        it.id === editingItemId 
          ? { ...it, ...itemForm, valor: parseFloat(itemForm.valor||0), quantidade: parseInt(itemForm.quantidade||1) } 
          : it
      );
    } else {
      // Lógica de Novo Item
      const newItem = { id: generateId(), categoria: activeCat, ...itemForm, valor: parseFloat(itemForm.valor||0), quantidade: parseInt(itemForm.quantidade||1) };
      updatedItemsList = [...localEnv.itens, newItem];
    }

    const updated = {...localEnv, itens: updatedItemsList};
    setLocalEnv(updated); 
    onSave(updated);
    
    // Limpa o formulário e sai do modo de edição
    setItemForm({ nome: '', marca: '', modelo: '', codigo: '', valor: '', quantidade: 1 });
    setEditingItemId(null);
  };

  const deleteItem = (itemId) => {
    const updated = {...localEnv, itens: localEnv.itens.filter(i => i.id !== itemId)};
    setLocalEnv(updated); onSave(updated);
  };

  const catItems = localEnv.itens.filter(i => i.categoria === activeCat);

  return (
    <div className="flex flex-col h-full bg-slate-50 animate-in fade-in relative">
      <div className="bg-white p-4 border-b flex justify-between items-center shadow-sm z-10 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600"><ChevronLeft size={20}/></button>
          <input type="text" value={localEnv.nome} onChange={e=>updateField('nome', e.target.value)} className="font-black text-xl text-[#1e5aa0] uppercase outline-none bg-transparent border-b border-transparent focus:border-[#1e5aa0]" placeholder="Nome do Ambiente" />
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total do Ambiente</p>
          <p className="font-black text-lg text-emerald-600">{formatCurrency(localEnv.itens.reduce((s,i)=>s+(i.valor*i.quantidade),0))}</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 flex flex-col md:flex-row gap-6">
        {/* Lado Esquerdo: Briefing e Fotos */}
        <div className="w-full md:w-1/3 space-y-6">
          <div className="bg-white p-5 rounded-xl border shadow-sm">
            <h4 className="font-black text-slate-700 uppercase text-xs mb-3">Detalhes e Briefing do Ambiente</h4>
            <textarea rows="4" value={localEnv.detalhes} onChange={e=>updateField('detalhes', e.target.value)} placeholder="Ex: Detalhes do acabamento..." className="w-full p-2.5 border rounded-lg outline-none resize-none text-sm font-medium mb-3"></textarea>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer mb-2">
              <input type="checkbox" checked={localEnv.usarEstiloGeral} onChange={e=>updateField('usarEstiloGeral', e.target.checked)} className="w-4 h-4 accent-[#1e5aa0]"/> Usar mesmo estilo do projeto geral
            </label>
            {!localEnv.usarEstiloGeral && <input type="text" placeholder="Estilo específico" value={localEnv.estilo} onChange={e=>updateField('estilo', e.target.value)} className="w-full p-2.5 border rounded-lg outline-none text-sm font-bold" />}
          </div>
        </div>

        {/* Lado Direito: Itens e Formulário */}
        <div className="w-full md:w-2/3 bg-white border rounded-xl shadow-sm flex flex-col overflow-hidden">
          <div className="flex bg-slate-800 text-slate-300 overflow-x-auto shrink-0 custom-scrollbar">
            {CATEGORIAS_AMBIENTE.map(cat => (
              <button key={cat} onClick={()=>{setActiveCat(cat); setEditingItemId(null); setItemForm({ nome: '', marca: '', modelo: '', codigo: '', valor: '', quantidade: 1 });}} className={`px-4 py-3 text-xs font-black uppercase tracking-widest whitespace-nowrap transition-colors border-b-2 ${activeCat === cat ? 'bg-slate-900 text-white border-[#1e5aa0]' : 'border-transparent hover:bg-slate-700'}`}>
                {cat} {localEnv.itens.filter(i=>i.categoria===cat).length > 0 && <span className="bg-[#1e5aa0] text-white px-1.5 rounded-full ml-1 text-[9px]">{localEnv.itens.filter(i=>i.categoria===cat).length}</span>}
              </button>
            ))}
          </div>

          <div className="p-5 flex-1 overflow-y-auto bg-slate-50">
            {/* FORMULÁRIO DE ADIÇÃO/EDIÇÃO */}
            <form onSubmit={handleSaveItem} className={`p-4 rounded-xl border shadow-sm mb-6 shrink-0 transition-colors ${editingItemId ? 'bg-amber-50 border-amber-200' : 'bg-white border-blue-100'}`}>
              <h5 className="text-xs font-black text-[#1e5aa0] uppercase mb-3 flex justify-between">
                {editingItemId ? `Editando Item em ${activeCat}` : `Adicionar Item em ${activeCat}`}
                {editingItemId && <button type="button" onClick={()=>{setEditingItemId(null); setItemForm({ nome: '', marca: '', modelo: '', codigo: '', valor: '', quantidade: 1 });}} className="text-red-500 hover:underline">Cancelar Edição</button>}
              </h5>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="md:col-span-2"><input required placeholder="Item *" value={itemForm.nome} onChange={e=>setItemForm({...itemForm, nome:e.target.value})} className="w-full p-2 border rounded text-xs font-bold" /></div>
                <div><input placeholder="Marca" value={itemForm.marca} onChange={e=>setItemForm({...itemForm, marca:e.target.value})} className="w-full p-2 border rounded text-xs" /></div>
                <div><input placeholder="Modelo" value={itemForm.modelo} onChange={e=>setItemForm({...itemForm, modelo:e.target.value})} className="w-full p-2 border rounded text-xs" /></div>
                <div><input placeholder="Cód." value={itemForm.codigo} onChange={e=>setItemForm({...itemForm, codigo:e.target.value})} className="w-full p-2 border rounded text-xs" /></div>
                <div><input type="number" min="1" required placeholder="Qtd *" value={itemForm.quantidade} onChange={e=>setItemForm({...itemForm, quantidade:e.target.value})} className="w-full p-2 border rounded text-xs font-bold text-center" /></div>
                <div><input type="number" step="0.01" required placeholder="Valor (R$) *" value={itemForm.valor} onChange={e=>setItemForm({...itemForm, valor:e.target.value})} className="w-full p-2 border rounded text-xs font-black text-emerald-600" /></div>
                <div><button type="submit" className={`w-full text-white font-bold py-2 rounded text-xs uppercase shadow-sm ${editingItemId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-[#1e5aa0] hover:bg-[#154278]'}`}>{editingItemId ? 'Atualizar' : 'Inserir'}</button></div>
              </div>
            </form>

            <div className="space-y-3">
              {catItems.map(item => {
                const itemDocs = envDocs.filter(d => d.itemId === item.id);
                return (
                  <div key={item.id} className={`bg-white border p-3 rounded-lg shadow-sm flex flex-col md:flex-row gap-4 relative transition-all ${editingItemId === item.id ? 'ring-2 ring-amber-400' : ''}`}>
                    <div className="absolute top-2 right-2 flex gap-2">
                      {/* 4. BOTÃO DE EDIÇÃO NO CARD DO ITEM */}
                      <button onClick={() => handleEditItem(item)} className="text-slate-400 hover:text-amber-600"><Edit size={16}/></button>
                      <button onClick={() => deleteItem(item.id)} className="text-slate-300 hover:text-red-500"><X size={16}/></button>
                    </div>

                    <div className="w-20 h-20 bg-slate-100 rounded border flex items-center justify-center shrink-0 overflow-hidden relative group">
                      {itemDocs.length > 0 ? <img src={itemDocs[0].conteudoBase64} className="w-full h-full object-cover" /> : <PaintBucket size={24} className="text-slate-300"/>}
                      <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-1 p-1">
                        {itemDocs.length > 0 && <button onClick={() => setZoomedImage(itemDocs[0].conteudoBase64)} className="text-white bg-white/20 hover:bg-[#1e5aa0] p-1 rounded w-full flex justify-center items-center gap-1 text-[9px] font-bold uppercase transition-colors"><Eye size={12}/> Ver</button>}
                        <label className="text-white bg-white/20 hover:bg-[#1e5aa0] p-1 rounded w-full flex justify-center items-center gap-1 text-[9px] font-bold uppercase cursor-pointer transition-colors"><Upload size={12}/> <input type="file" className="hidden" onChange={(e)=>onUpload(e, 'item_ambiente', item.id)} /> {itemDocs.length > 0 ? 'Trocar' : 'Upload'}</label>
                      </div>
                    </div>

                    <div className="flex-1">
                      <p className="font-black text-slate-800 text-sm uppercase">{item.nome}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-slate-500 font-medium">
                        {item.marca && <span>Marca: {item.marca}</span>}{item.modelo && <span>Mod: {item.modelo}</span>}{item.codigo && <span>Cód: {item.codigo}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0 min-w-[100px] flex flex-col justify-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">{item.quantidade}x {formatCurrency(item.valor)}</p>
                      <p className="font-black text-emerald-600 text-lg">{formatCurrency(item.valor * item.quantidade)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Zoom */}
      {zoomedImage && (
        <div className="fixed inset-0 bg-slate-900/90 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm cursor-pointer" onClick={() => setZoomedImage(null)}>
          <button className="absolute top-4 right-4 text-white hover:text-red-500 bg-black/50 p-2 rounded-full"><X size={24}/></button>
          <img src={zoomedImage} className="max-w-[95vw] max-h-[90vh] object-contain rounded-xl shadow-2xl" />
        </div>
      )}
    </div>
  );
}

function ProjectModal({ appUser, clients, companyUsers, project, onClose }) {
  const [formData, setFormData] = useState(project || { clientId: '', nomeProjeto: '', status: 'EM ANDAMENTO', valorTotal: '', formaPagamento: 'A VISTA', dataFechamento: getToday(), responsavelId: '', faseAnalitica: 'LEVANTAMENTO', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '', usarEnderecoCliente: false });
  const paymentOptions = ['A VISTA', ...Array.from({length: 12}, (_, i) => `CARTAO ${i+1}X`), ...Array.from({length: 4}, (_, i) => `BOLETO ${i+1}X`)];
  
  const handleClientChange = (e) => {
    const clientId = e.target.value;
    setFormData(prev => {
      let updated = { ...prev, clientId };
      if(prev.usarEnderecoCliente && clientId) {
        const c = clients.find(x => x.id === clientId);
        if(c) updated = { ...updated, cep: c.cep||'', logradouro: c.logradouro||'', numero: c.numero||'', complemento: c.complemento||'', bairro: c.bairro||'', cidade: c.cidade||'', uf: c.uf||'' };
      }
      return updated;
    });
  };

  const handleUsarEnderecoChange = (e) => {
    const checked = e.target.checked;
    setFormData(prev => {
      let updated = { ...prev, usarEnderecoCliente: checked };
      if(checked && prev.clientId) {
        const c = clients.find(x => x.id === prev.clientId);
        if(c) updated = { ...updated, cep: c.cep||'', logradouro: c.logradouro||'', numero: c.numero||'', complemento: c.complemento||'', bairro: c.bairro||'', cidade: c.cidade||'', uf: c.uf||'' };
      } else if(!checked) {
        updated = { ...updated, cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' };
      }
      return updated;
    });
  };

  const handleCepBlur = async (e) => {
    if(formData.usarEnderecoCliente) return; 
    const cep = e.target.value.replace(/\D/g, '');
    if(cep.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await res.json();
        if(!data.erro) setFormData(prev => ({...prev, logradouro: data.logradouro, bairro: data.bairro, cidade: data.localidade, uf: data.uf}));
      } catch(err) { console.error(err); }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const client = clients.find(c => c.id === formData.clientId);
    const v = parseFloat(String(formData.valorTotal).replace(',', '.'));
    
    let novasParcelas = project?.parcelas || [];
    if (!project || formData.valorTotal !== project.valorTotal || formData.formaPagamento !== project.formaPagamento || formData.dataFechamento !== project.dataFechamento) {
      const count = formData.formaPagamento.includes('X') ? parseInt(formData.formaPagamento.replace(/\D/g, '')) : 1;
      novasParcelas = Array.from({length: count}).map((_, i) => {
        const d = new Date(formData.dataFechamento); d.setMonth(d.getMonth() + i);
        return { id: generateId(), numero: i+1, valor: v/count, dataVencimento: d.toISOString().split('T')[0], paga: false };
      });
    }

    const data = { ...formData, companyId: appUser.companyId, clientName: client.nome, valorTotal: v, parcelas: novasParcelas };
    if(!project) { data.briefing = ''; data.estiloProjeto = ''; data.ambientes = []; } 
    try {
      if (project) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', project.id), data);
      else await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'projects'), data);
      onClose();
    } catch(err) { console.error(err); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-[80] backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-3xl flex flex-col shadow-2xl max-h-[95vh]">
        <div className="p-4 bg-[#1e5aa0] text-white rounded-t-2xl flex justify-between items-center"><h2 className="font-bold text-lg uppercase">{project ? 'Editar' : 'Lançar'} Projeto Inicial</h2><button onClick={onClose}><X size={20}/></button></div>
        <form id="pform" onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2"><label className="text-xs font-bold text-slate-500 uppercase">Nome do Projeto *</label><input required value={formData.nomeProjeto} onChange={e=>setFormData({...formData, nomeProjeto:e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none font-bold text-slate-800" /></div>
            <div><label className="text-xs font-bold text-slate-500 uppercase">Cliente *</label><select required value={formData.clientId} onChange={handleClientChange} className="w-full p-2.5 border rounded-lg bg-white mt-1 outline-none"><option></option>{clients.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
            <div><label className="text-xs font-bold text-slate-500 uppercase">Arquiteto Responsável</label><select value={formData.responsavelId} onChange={e=>setFormData({...formData, responsavelId:e.target.value})} className="w-full p-2.5 border rounded-lg bg-white mt-1 outline-none"><option value="">Nenhum</option>{companyUsers.map(u=><option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>
            <div><label className="text-xs font-bold text-slate-500 uppercase">Data Fechamento</label><input required type="date" value={formData.dataFechamento} onChange={e=>setFormData({...formData, dataFechamento:e.target.value})} className="w-full p-2.5 border rounded-lg mt-1 outline-none font-medium" /></div>
            <div><label className="text-xs font-bold text-slate-500 uppercase">Status Geral</label><select value={formData.status} onChange={e=>setFormData({...formData, status:e.target.value})} className="w-full p-2.5 border rounded-lg bg-white mt-1 outline-none font-bold"><option>EM ANDAMENTO</option><option>ENTREGUE</option><option>CANCELADO</option></select></div>
            
            <div className="md:col-span-2 border-t pt-4 mt-2">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-bold text-slate-700 uppercase text-sm">Endereço da Obra / Projeto</h4>
                <label className="flex items-center gap-2 text-xs font-bold text-[#1e5aa0] cursor-pointer bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 transition-colors hover:bg-blue-100">
                  <input type="checkbox" checked={formData.usarEnderecoCliente} onChange={handleUsarEnderecoChange} className="w-4 h-4 accent-[#1e5aa0]" />
                  Usar endereço do cliente
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="sm:col-span-1"><label className="text-xs font-bold text-slate-500 uppercase">CEP</label><input type="text" value={maskCEP(formData.cep)} onChange={e=>setFormData({...formData, cep:e.target.value})} onBlur={handleCepBlur} disabled={formData.usarEnderecoCliente} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none disabled:bg-slate-100 disabled:text-slate-400" placeholder="00000-000" /></div>
                <div className="sm:col-span-2"><label className="text-xs font-bold text-slate-500 uppercase">Logradouro / Rua</label><input value={formData.logradouro} onChange={e=>setFormData({...formData, logradouro:e.target.value})} disabled={formData.usarEnderecoCliente} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none disabled:bg-slate-100 disabled:text-slate-400" /></div>
                <div className="sm:col-span-1"><label className="text-xs font-bold text-slate-500 uppercase">Número</label><input value={formData.numero} onChange={e=>setFormData({...formData, numero:e.target.value})} disabled={formData.usarEnderecoCliente} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none disabled:bg-slate-100 disabled:text-slate-400" /></div>
                <div className="sm:col-span-1"><label className="text-xs font-bold text-slate-500 uppercase">Complemento</label><input value={formData.complemento} onChange={e=>setFormData({...formData, complemento:e.target.value})} disabled={formData.usarEnderecoCliente} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none disabled:bg-slate-100 disabled:text-slate-400" /></div>
                <div className="sm:col-span-1"><label className="text-xs font-bold text-slate-500 uppercase">Bairro</label><input value={formData.bairro} onChange={e=>setFormData({...formData, bairro:e.target.value})} disabled={formData.usarEnderecoCliente} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none disabled:bg-slate-100 disabled:text-slate-400" /></div>
                <div className="sm:col-span-1"><label className="text-xs font-bold text-slate-500 uppercase">Cidade</label><input value={formData.cidade} onChange={e=>setFormData({...formData, cidade:e.target.value})} disabled={formData.usarEnderecoCliente} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none disabled:bg-slate-100 disabled:text-slate-400" /></div>
                <div className="sm:col-span-1"><label className="text-xs font-bold text-slate-500 uppercase">UF</label><input value={formData.uf} onChange={e=>setFormData({...formData, uf:e.target.value})} disabled={formData.usarEnderecoCliente} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none disabled:bg-slate-100 disabled:text-slate-400 uppercase" maxLength="2" /></div>
              </div>
            </div>

            <div className="md:col-span-2 border-t pt-4 mt-2"><h4 className="font-bold text-slate-700 uppercase text-sm"><DollarSign size={16} className="inline mr-1 text-emerald-600"/> Financeiro do Contrato (Seus Honorários)</h4></div>
            <div><label className="text-xs font-bold text-slate-500 uppercase">Valor do Contrato (R$) *</label><input required type="number" step="0.01" disabled={project?.parcelas?.some(x=>x.paga)} value={formData.valorTotal} onChange={e=>setFormData({...formData, valorTotal:e.target.value})} className="w-full p-2.5 border rounded-lg font-black text-[#1e5aa0] focus:ring-2 mt-1 outline-none disabled:bg-slate-100" /></div>
            <div><label className="text-xs font-bold text-slate-500 uppercase">Parcelamento *</label><select required disabled={project?.parcelas?.some(x=>x.paga)} value={formData.formaPagamento} onChange={e=>setFormData({...formData, formaPagamento:e.target.value})} className="w-full p-2.5 border rounded-lg bg-white mt-1 outline-none font-bold disabled:bg-slate-100">{paymentOptions.map(o=><option key={o}>{o}</option>)}</select></div>
          </div>
        </form>
        <div className="p-4 border-t bg-slate-50 flex justify-end space-x-2 rounded-b-2xl"><button onClick={onClose} type="button" className="px-5 py-2.5 rounded-lg font-bold text-slate-600 hover:bg-slate-200">Cancelar</button><button form="pform" type="submit" className="px-5 py-2.5 rounded-lg font-bold text-white bg-[#1e5aa0] hover:bg-[#154278]">Salvar Lançamento Inicial</button></div>
      </div>
    </div>
  );
}

// --- RECEBIMENTOS COM RELATÓRIO E CALENDÁRIO DUPLO ---
function RecebimentosView({ projects, contasPagar, docTypes, suppliers, canEdit, appUser, groups, subgroups }) {
  const [baseDate, setBaseDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [dayModalItems, setDayModalItems] = useState(null); // Itens do dia selecionado
  const [payReceiptData, setPayReceiptData] = useState(null); 
  const [payAPData, setPayAPData] = useState(null);
  const [payBillData, setPayBillData] = useState(null);
  const [viewingBillDetails, setViewingBillDetails] = useState(null);
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [confirmData, setConfirmData] = useState(null);

  const prevMonth = () => setBaseDate(new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 1));
  const nextMonth = () => setBaseDate(new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1));
  const monthsToRender = [baseDate];

  const handlePay = async (e) => {
    e.preventDefault();
    const form = e.target;
    const date = form.date.value;
    const formaRecebimento = form.formaRecebimento.value;

    const novas = payReceiptData.p.parcelas.map((x, i) => i === payReceiptData.index ? {...x, paga: true, dataRecebimento: date, formaRecebimento} : x);
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', payReceiptData.pId), { parcelas: novas });
    setPayReceiptData(null);
    setDayModalItems(null); // Fecha a listagem do dia
  };
  
  const handleUndo = async (item) => {
    const novas = item.p.parcelas.map((x, i) => i === item.index ? {...x, paga: false, dataRecebimento: null, formaRecebimento: null} : x);
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', item.pId), { parcelas: novas });
    setDayModalItems(null);
  };

  const handlePayAP = async (e) => {
    e.preventDefault();
    const form = e.target;
    const date = form.date.value;
    const formaPagamento = form.formaPagamento.value;

    const novas = payAPData.doc.parcelas.map((x, i) => 
      i === payAPData.index ? {...x, status: 'pago', dataPagamento: date, formaPagamento} : x
    );
    const todosPagos = novas.every(p => p.status === 'pago');
    
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'contas_pagar', payAPData.docId), { parcelas: novas, status: todosPagos ? 'pago' : 'pendente' });
    setPayAPData(null);
    setDayModalItems(null);
  };

  const handleUndoAP = async (item) => {
    const novas = item.doc.parcelas.map((x, i) => 
      i === item.index ? {...x, status: 'pendente', dataPagamento: null, formaPagamento: null} : x
    );
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'contas_pagar', item.docId), { parcelas: novas, status: 'pendente' });
    setDayModalItems(null);
  };

  const handlePayBill = async (e) => {
    e.preventDefault();
    const form = e.target;
    const date = form.date.value;
    const formaPagamento = form.formaPagamento.value;

    // Agrupa atualizações por documento para evitar estados inconsistentes
    const docsToUpdate = {};

    // Paga todas as parcelas que compõem essa fatura agrupada
    for (const item of payBillData.items) {
      const currentDoc = docsToUpdate[item.docId] || (contasPagar || []).find(d => d.id === item.docId);
      if (currentDoc) {
        const novas = currentDoc.parcelas.map((x, i) => 
          i === item.index ? {...x, status: 'pago', dataPagamento: date, formaPagamento} : x
        );
        docsToUpdate[item.docId] = { ...currentDoc, parcelas: novas };
      }
    }

    for (const docId in docsToUpdate) {
      const docData = docsToUpdate[docId];
      const todosPagos = docData.parcelas.every(p => p.status === 'pago');
      if (docData) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'contas_pagar', docId), { parcelas: docData.parcelas, status: todosPagos ? 'pago' : 'pendente' });
      }
    }
    setPayBillData(null);
    setDayModalItems(null); // Fecha a listagem do dia
  };

  const handleUndoBill = async (bill) => {
    // Reverte o status de todas as parcelas que compõem essa fatura agrupada
    const docsToUpdate = {};

    for (const item of bill.items) {
      const currentDoc = docsToUpdate[item.docId] || (contasPagar || []).find(d => d.id === item.docId);
      if (currentDoc) {
        const novas = currentDoc.parcelas.map((x, i) => 
          i === item.index ? { ...x, status: 'pendente', dataPagamento: null, formaPagamento: null } : x
        );
        docsToUpdate[item.docId] = { ...currentDoc, parcelas: novas };
      }
    }

    for (const docId in docsToUpdate) {
      const docData = docsToUpdate[docId];
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'contas_pagar', docId), { 
        parcelas: docData.parcelas, 
        status: 'pendente' 
      });
    }
    setPayBillData(null);
    setDayModalItems(null);
  };

  return (
    <div className="h-full flex flex-col space-y-2 overflow-hidden">
      <div className="flex justify-between items-center w-full shrink-0 mb-4">
        <h3 className="text-xl font-bold text-slate-800 uppercase tracking-wide border-b-4 border-[#1e5aa0] pb-0.5">Financeiro (Recebimentos)</h3>
        <div className="flex space-x-2">
          <button onClick={()=>setShowReportModal(true)} className="bg-white border text-[#1e5aa0] px-4 py-2 rounded-lg font-bold text-xs uppercase flex items-center gap-1 shadow-sm hover:bg-blue-50"><FileDown size={16}/> Extrato</button>
          <button onClick={prevMonth} className="bg-white border border-slate-300 text-slate-700 p-2 rounded-lg hover:bg-slate-100 transition-colors shadow-sm"><ChevronLeft size={18} /></button>
          <button onClick={nextMonth} className="bg-white border border-slate-300 text-slate-700 p-2 rounded-lg hover:bg-slate-100 transition-colors shadow-sm"><ChevronRight size={18} /></button>
        </div>
      </div>
      
      <div className="flex-1 min-h-0 pb-2">
        <div className="grid grid-cols-1 gap-4 items-stretch h-full">
          {monthsToRender.map((monthDate) => (
            <CompactCalendar 
              key={monthDate.toISOString()} 
              currentDate={monthDate} 
              projects={projects} 
              contasPagar={contasPagar}
              suppliers={suppliers}
              docTypes={docTypes}
              canEdit={canEdit}
              onOpenDayDetails={(items) => setDayModalItems(items)}
            />
          ))}
        </div>
      </div>

      {dayModalItems && !payReceiptData && !payAPData && !payBillData && (
        <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-[80] backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg flex flex-col shadow-2xl overflow-hidden max-h-[90vh]">
            {viewingBillDetails ? (
              <>
                <div className="p-4 bg-slate-800 text-white font-bold flex justify-between items-center uppercase text-sm">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setViewingBillDetails(null)} className="p-1 hover:bg-slate-700 rounded transition-colors"><ChevronLeft size={20}/></button>
                    <span>Fatura: {viewingBillDetails.key}</span>
                  </div>
                  <button onClick={() => { setDayModalItems(null); setViewingBillDetails(null); }}><X size={20}/></button>
                </div>
                <div className="p-6 overflow-y-auto space-y-3 bg-slate-50">
                  {viewingBillDetails.items.map((item, idx) => {
                    const originalDoc = (contasPagar || []).find(d => d.id === item.docId);
                    const supplier = (suppliers || []).find(s => s.id === originalDoc?.fornecedorId);
                    const totalParc = originalDoc?.numParcelas || 1;
                    return (
                      <div key={idx} className="p-3 bg-white border border-slate-200 rounded-xl flex justify-between items-center shadow-sm group">
                        <div className="flex-1 min-w-0 pr-4">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-slate-800 text-xs uppercase truncate">{supplier?.nome || 'Fornecedor N/A'}</p>
                            {totalParc > 1 && (
                              <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">
                                {String(item.numero).padStart(2, '0')} de {String(totalParc).padStart(2, '0')}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 font-bold uppercase truncate">{originalDoc?.descricao || 'Sem descrição'}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          {canEdit && (
                            <button onClick={() => { setEditingEntry(originalDoc); setIsEntryModalOpen(true); }} className="p-1.5 text-slate-400 hover:text-[#1e5aa0] hover:bg-slate-100 rounded-lg opacity-0 group-hover:opacity-100 transition-all" title="Editar Lançamento">
                              <Edit size={14} />
                            </button>
                          )}
                          <p className="font-black text-slate-700 text-sm whitespace-nowrap">{formatCurrency(item.valor)}</p>
                        </div>
                      </div>
                    );
                  })}
                  <div className="pt-4 border-t border-slate-200 flex justify-between items-center mt-2">
                    <span className="font-black text-slate-400 uppercase text-[10px] tracking-widest">Total Consolidado</span>
                    <span className="font-black text-blue-600 text-lg">{formatCurrency(viewingBillDetails.total)}</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="p-4 bg-[#1e5aa0] text-white font-bold flex justify-between items-center uppercase text-sm">Lançamentos do Dia <button onClick={() => { setDayModalItems(null); setViewingBillDetails(null); }}><X size={20}/></button></div>
            <div className="p-6 overflow-y-auto space-y-3">
              {dayModalItems.receipts.length > 0 && <h4 className="text-[10px] font-black text-slate-400 uppercase border-b pb-1">Recebimentos</h4>}
              {dayModalItems.receipts.map((item, idx) => (
                <DayItemRow key={`rec-${idx}`} title={item.p.nomeProjeto} subtitle={item.p.clientName} value={item.valor} isPaid={item.paga} paidInfo={item.paga ? `Recebido em ${formatDate(item.dataRecebimento)} via ${item.formaRecebimento}` : null} colorClass={item.paga ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'} valueColor="text-emerald-600" onPay={()=>setPayReceiptData(item)} onUndo={()=>setConfirmData({ message: 'Desfazer o recebimento?', onConfirm: async () => { await handleUndo(item); setConfirmData(null); }})} canEdit={canEdit} />
              ))}
              
              {dayModalItems.apIndividual.length > 0 && <h4 className="text-[10px] font-black text-slate-400 uppercase border-b pb-1 mt-4">Contas a Pagar</h4>}
              {dayModalItems.apIndividual.map((item, idx) => (
                <DayItemRow key={`ap-${idx}`} title={suppliers.find(s=>s.id===item.doc.fornecedorId)?.nome || 'Fornecedor'} subtitle={item.doc.descricao} value={item.valor} isPaid={item.status === 'pago'} paidInfo={item.status === 'pago' ? `Pago em ${formatDate(item.dataPagamento)} via ${item.formaPagamento}` : null} colorClass={item.status === 'pago' ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'} valueColor="text-red-600" onPay={()=>setPayAPData(item)} onUndo={()=>setConfirmData({ message: 'Desfazer o pagamento?', onConfirm: async () => { await handleUndoAP(item); setConfirmData(null); }})} canEdit={canEdit} />
              ))}

              {dayModalItems.bills.length > 0 && <h4 className="text-[10px] font-black text-slate-400 uppercase border-b pb-1 mt-4">Faturas de Cartão</h4>}
              {dayModalItems.bills.map((bill, idx) => (
                <DayItemRow key={`bill-${idx}`} title={bill.key} subtitle="Fatura Consolidada" value={bill.total} isPaid={bill.isPaid} paidInfo={bill.isPaid ? 'Fatura Liquidada' : null} colorClass={bill.isPaid ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'} valueColor="text-blue-600" onPay={()=>setPayBillData(bill)} onUndo={() => setConfirmData({ message: 'Desfazer o pagamento desta fatura?', onConfirm: async () => { await handleUndoBill(bill); setConfirmData(null); }})} canEdit={canEdit} onView={() => setViewingBillDetails(bill)} />
              ))}
            </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal Baixa Recebimento */}
      {payReceiptData && (
        <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-[90] backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 bg-emerald-600 text-white font-bold flex justify-between items-center uppercase text-sm">Confirmar Recebimento <button onClick={()=>setPayReceiptData(null)}><X size={20}/></button></div>
            <form onSubmit={handlePay} className="p-6 flex flex-col gap-4">
              <BaixaFormContent label="Recebido via" value={payReceiptData.valor} nameSuffix="Recebimento" color="emerald" options={['PIX', 'DINHEIRO', 'CRÉDITO EM CONTA', 'CHEQUE', 'PERMUTA']} />
            </form>
          </div>
        </div>
      )}

      {/* Modal Baixa Contas a Pagar */}
      {payAPData && (
        <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-[90] backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 bg-red-600 text-white font-bold flex justify-between items-center uppercase text-sm">Confirmar Pagamento <button onClick={()=>setPayAPData(null)}><X size={20}/></button></div>
            <form onSubmit={handlePayAP} className="p-6 flex flex-col gap-4">
              <BaixaFormContent label="Pago via" value={payAPData.valor} nameSuffix="Pagamento" color="red" options={['PIX', 'TRANSFERÊNCIA', 'BOLETO', 'CARTÃO DÉBITO', 'DINHEIRO']} />
            </form>
          </div>
        </div>
      )}

      {/* Modal Baixa Fatura Cartão */}
      {payBillData && (
        <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-[90] backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 bg-blue-600 text-white font-bold flex justify-between items-center uppercase text-sm">Liquidar Fatura <button onClick={()=>setPayBillData(null)}><X size={20}/></button></div>
            <form onSubmit={handlePayBill} className="p-6 flex flex-col gap-4">
              <BaixaFormContent label="Fatura paga via" value={payBillData.total} nameSuffix="Pagamento" color="blue" options={['DÉBITO AUTOMÁTICO', 'PIX', 'SALDO EM CONTA']} />
            </form>
          </div>
        </div>
      )}

      {showReportModal && <FinancialReportModal projects={projects} onClose={()=>setShowReportModal(false)} />}
      {isEntryModalOpen && (
        <EntryModal 
          onClose={() => { setIsEntryModalOpen(false); setEditingEntry(null); }} 
          suppliers={suppliers} 
          docTypes={docTypes} 
          groups={groups} 
          subgroups={subgroups} 
          appUser={appUser} 
          editingEntry={editingEntry}
        />
      )}
      {confirmData && <ConfirmModal message={confirmData.message} onConfirm={confirmData.onConfirm} onCancel={() => setConfirmData(null)} />}
    </div>
  );
}

function DayItemRow({ title, subtitle, value, isPaid, paidInfo, colorClass, valueColor, onPay, onUndo, canEdit, onView }) {
  return (
    <div className={`p-4 rounded-xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${colorClass}`}>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <p className="font-black text-slate-800 text-sm uppercase truncate">{title}</p>
            <p className="text-xs text-slate-500 uppercase truncate">{subtitle}</p>
          </div>
          {onView && (
            <button onClick={onView} className="p-1.5 text-slate-400 hover:text-[#1e5aa0] hover:bg-slate-100 rounded-lg transition-colors ml-2" title="Ver Detalhes">
              <Eye size={18} />
            </button>
          )}
        </div>
        <p className={`font-black text-lg mt-1 ${isPaid ? valueColor : 'text-slate-600'}`}>{formatCurrency(value)}</p>
        {isPaid && <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase flex items-center gap-1"><CheckCircle2 size={12}/> {paidInfo}</p>}
      </div>
      {canEdit && (
        <div className="shrink-0 w-full sm:w-auto">
          {!isPaid ? (
            <button onClick={onPay} className="w-full bg-[#1e5aa0] text-white px-5 py-2.5 rounded-lg font-bold text-xs hover:bg-[#154278] shadow uppercase">Efetuar Baixa</button>
          ) : onUndo && (
            <button onClick={onUndo} className="w-full bg-white border border-slate-300 text-slate-600 px-5 py-2.5 rounded-lg font-bold text-xs hover:bg-slate-100 shadow-sm uppercase">Desfazer</button>
          )}
        </div>
      )}
    </div>
  );
}

function BaixaFormContent({ label, value, color, options }) {
  const btnColor = color === 'emerald' ? 'bg-emerald-600' : color === 'red' ? 'bg-red-600' : 'bg-blue-600';
  const focusRing = color === 'emerald' ? 'focus:ring-emerald-500' : color === 'red' ? 'focus:ring-red-500' : 'focus:ring-blue-500';

  return (
    <>
      <div><p className="text-xs text-slate-500 uppercase font-bold">Valor Total</p><p className={`font-black text-2xl ${color === 'emerald' ? 'text-emerald-600' : color === 'red' ? 'text-red-600' : 'text-blue-600'}`}>{formatCurrency(value)}</p></div>
      <div>
        <label className="text-xs text-slate-500 uppercase font-bold mb-1 block">{label} *</label>
        <select name="formaPagamento" required className={`w-full border p-2.5 rounded-lg outline-none ${focusRing} font-medium text-sm bg-white text-slate-800`}>
          <option value="">Selecione...</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs text-slate-500 uppercase font-bold mb-1 block">Data da Conferência *</label>
        <div className="flex gap-2">
          <button type="button" onClick={()=>{document.getElementById('pDate').value=getToday();}} className="bg-slate-100 font-bold text-slate-600 px-3 py-2 rounded-lg text-xs hover:bg-slate-200">Hoje</button>
          <input id="pDate" required name="date" type="date" defaultValue={getToday()} className={`flex-1 border p-2 rounded-lg outline-none ${focusRing} font-medium text-sm`} />
        </div>
      </div>
      <button type="submit" className={`w-full ${btnColor} text-white font-bold py-3 rounded-xl mt-2 hover:brightness-90 shadow-md uppercase text-xs`}>Confirmar Lançamento</button>
    </>
  );
}

function CompactCalendar({ currentDate, projects, contasPagar, suppliers, docTypes, canEdit, onOpenDayDetails }) {
  const { isLiquid } = useTheme();
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  const days = [];
  for (let i = 0; i < startOffset; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const weekDays = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];
  const installmentsThisMonth = {};
  const apThisMonth = {}; // Contas a Pagar individuais
  const creditCardBills = {}; // Agrupador de faturas por dia
  let monthTotalPaid = 0, monthTotalPending = 0;
  let monthTotalPaidAP = 0, monthTotalPendingAP = 0;
  
  projects.forEach(project => {
    (project.parcelas || []).forEach((parc, index) => {
      if (!parc.dataVencimento) return;
      const [pYear, pMonth, pDay] = parc.dataVencimento.split('-');
      if (parseInt(pYear) === year && parseInt(pMonth) - 1 === month) {
        const dayNum = parseInt(pDay);
        if (!installmentsThisMonth[dayNum]) installmentsThisMonth[dayNum] = [];
        installmentsThisMonth[dayNum].push({ ...parc, pId: project.id, index: index, p: project });
        if (parc.paga) monthTotalPaid += Number(parc.valor); else monthTotalPending += Number(parc.valor);
      }
    });
  });

  // Processamento de Contas a Pagar
  (contasPagar || []).forEach(docPay => {
    const type = (docTypes || []).find(t => t.id === docPay.tipoDocumentoId);
    (docPay.parcelas || []).forEach((parc, index) => {
      if (!parc.dataVencimento) return;
      const [pYear, pMonth, pDay] = parc.dataVencimento.split('-');
      if (parseInt(pYear) === year && parseInt(pMonth) - 1 === month) {
        const dayNum = parseInt(pDay);
        const valor = Number(parc.valor) || 0;
        
        if (type?.isFatura && docPay.banco) {
          const displayKey = `${type.nome} - ${docPay.banco}`;
          if (!creditCardBills[dayNum]) creditCardBills[dayNum] = {};
          if (!creditCardBills[dayNum][displayKey]) creditCardBills[dayNum][displayKey] = { total: 0, items: [], isPaid: true };
          
          creditCardBills[dayNum][displayKey].total += valor;
          creditCardBills[dayNum][displayKey].items.push({ ...parc, docId: docPay.id, index });
          if (parc.status !== 'pago') creditCardBills[dayNum][displayKey].isPaid = false;
          if (parc.status === 'pago') monthTotalPaidAP += valor; else monthTotalPendingAP += valor;
        } else {
          if (!apThisMonth[dayNum]) apThisMonth[dayNum] = [];
          apThisMonth[dayNum].push({ ...parc, docId: docPay.id, index, doc: docPay });
          if (parc.status === 'pago') monthTotalPaidAP += valor; else monthTotalPendingAP += valor;
        }
      }
    });
  });

  const getDayMetadata = (day) => {
    const receipts = installmentsThisMonth[day] || [];
    const apIndiv = apThisMonth[day] || [];
    const bills = Object.entries(creditCardBills[day] || {}).map(([key, data]) => ({ key, ...data }));
    
    const hasItems = receipts.length > 0 || apIndiv.length > 0 || bills.length > 0;
    const allPaid = (receipts.every(r => r.paga)) && 
                    (apIndiv.every(a => a.status === 'pago')) && 
                    (bills.every(b => b.isPaid));

    return { receipts, apIndividual: apIndiv, bills, hasItems, allPaid };
  };

  return (
    <div className={`${isLiquid ? 'liquid-calendar' : 'bg-white rounded-2xl shadow-xl border border-slate-200'} flex flex-col h-full overflow-hidden`}>
      <div className={`${isLiquid ? 'liquid-calendar-header' : 'bg-slate-900'} text-white p-4 text-center font-black uppercase text-sm tracking-[0.2em] shrink-0`}>{currentDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}</div>
      <div className={`${isLiquid ? 'liquid-calendar-weekdays' : 'border-b border-slate-200 bg-slate-50'} grid grid-cols-7 shrink-0`}>{weekDays.map((d, i) => <div key={i} className="text-center py-1 sm:py-1.5 text-[9px] sm:text-[10px] font-bold text-slate-500 border-r border-slate-200 last:border-r-0 uppercase">{d}</div>)}</div>
      <div className={`${isLiquid ? 'liquid-calendar-grid' : 'bg-white'} grid grid-cols-7 auto-rows-fr flex-1 min-h-0`}>
        {days.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} className={`${isLiquid ? 'liquid-calendar-empty' : 'border-r border-b border-slate-100 bg-slate-50'}`}></div>;
          const meta = getDayMetadata(day);
          
          let bgClass = isLiquid ? "liquid-calendar-day" : "bg-white";
          if (meta.hasItems && meta.allPaid) bgClass = isLiquid ? "liquid-calendar-day liquid-calendar-day-paid" : "bg-[#d4edd9]";
          else if (meta.hasItems && !meta.allPaid) bgClass = isLiquid ? "liquid-calendar-day liquid-calendar-day-pending" : "bg-[#fff3cd]";
          
          return (
            <div key={day} className={`${isLiquid ? '' : 'border-r border-b border-slate-100'} p-2 flex flex-col justify-between overflow-hidden min-h-[80px] sm:min-h-[100px] ${bgClass} ${meta.hasItems ? 'cursor-pointer transition-all' : ''}`} onClick={() => meta.hasItems && onOpenDayDetails(meta)}>
              <div className="flex justify-between items-start mb-1 shrink-0">
                <span className="font-bold text-[10px] sm:text-xs text-slate-800 leading-none">{day}</span>
                {meta.hasItems && <div className={`w-3.5 h-3.5 border rounded flex items-center justify-center transition-colors ${meta.allPaid ? 'bg-[#73c87f] border-[#73c87f]' : 'bg-white border-[#73c87f]'}`}>{meta.allPaid && <Check size={10} className="text-white font-bold" />}</div>}
              </div>
              <div className="flex-1 flex flex-col justify-start overflow-hidden min-h-0 space-y-1">
                <div className="flex flex-col gap-px overflow-hidden">
                  {meta.receipts.slice(0, 2).map((inst, i) => (
                    <div key={`r-${i}`} className={`text-[8px] sm:text-[9px] truncate font-bold leading-tight flex justify-between ${inst.paga ? 'text-emerald-700/50 line-through' : 'text-emerald-700'}`}>
                      <span>In: {inst.p.clientName.split(' ')[0]}</span>
                      <span className="hidden sm:inline">{formatCurrency(inst.valor)}</span>
                    </div>
                  ))}
                  {meta.apIndividual.slice(0, 2).map((inst, i) => (
                    <div key={`a-${i}`} className={`text-[8px] sm:text-[9px] truncate font-bold leading-tight flex justify-between ${inst.status === 'pago' ? 'text-red-700/50 line-through' : 'text-red-700'}`}>
                      <span>Out: {suppliers.find(s=>s.id===inst.doc.fornecedorId)?.nome.split(' ')[0] || 'Desp.'}</span>
                      <span className="hidden sm:inline">{formatCurrency(inst.valor)}</span>
                    </div>
                  ))}
                </div>
                
                {/* Consolidado de Faturas */}
                <div className="flex flex-wrap gap-px mt-0.5">
                  {meta.bills.map((bill, i) => (
                    <div key={`b-${i}`} className={`text-[7px] font-black px-1 rounded truncate flex-1 min-w-[30px] ${bill.isPaid ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'}`}>💳 {bill.key.split(' - ')[1]}</div>
                  ))}
                </div>

                {/* Indicador de mais itens */}
                {(meta.receipts.length + meta.apIndividual.length > 4) && (
                  <div className="text-[7px] font-black text-slate-400 uppercase text-right">
                    + {meta.receipts.length + meta.apIndividual.length - 4} lançamentos
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="bg-slate-50 border-t border-slate-200 p-2 sm:p-2.5 grid grid-cols-4 gap-2 shrink-0">
        <div className="flex flex-col"><span className="text-[8px] sm:text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5 flex items-center gap-1 truncate"><Check size={10} className="text-green-600 shrink-0" /> Recebidos</span><span className="text-green-700 font-black text-xs sm:text-sm truncate" title={formatCurrency(monthTotalPaid)}>{formatCurrency(monthTotalPaid)}</span></div>
        <div className="flex flex-col border-l border-slate-200 pl-2"><span className="text-[8px] sm:text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5 flex items-center gap-1 truncate">A Receber <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block shrink-0"></span></span><span className="text-amber-600 font-black text-xs sm:text-sm truncate" title={formatCurrency(monthTotalPending)}>{formatCurrency(monthTotalPending)}</span></div>
        <div className="flex flex-col border-l border-slate-200 pl-2"><span className="text-[8px] sm:text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5 flex items-center gap-1 truncate"><Check size={10} className="text-red-600 shrink-0" /> Pagos</span><span className="text-red-700 font-black text-xs sm:text-sm truncate" title={formatCurrency(monthTotalPaidAP)}>{formatCurrency(monthTotalPaidAP)}</span></div>
        <div className="flex flex-col border-l border-slate-200 pl-2"><span className="text-[8px] sm:text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5 flex items-center gap-1 truncate">A Pagar <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block shrink-0"></span></span><span className="text-red-600 font-black text-xs sm:text-sm truncate" title={formatCurrency(monthTotalPendingAP)}>{formatCurrency(monthTotalPendingAP)}</span></div>
      </div>
    </div>
  );
}

function FinancialReportModal({ projects, onClose }) {
  const [dataIni, setDataIni] = useState(getToday().slice(0,8)+'01');
  const [dataFim, setDataFim] = useState(getToday());

const generateReport = (e) => {
    e.preventDefault();
    let recebidos = 0, previstosPendentes = 0;
    const listaHtml = [];

    projects.forEach(p => {
      (p.parcelas||[]).forEach(parc => {
        // CORREÇÃO AQUI: Fallback (plano B) para a data de vencimento em parcelas antigas
        const dTarget = parc.paga ? (parc.dataRecebimento || parc.dataVencimento) : parc.dataVencimento;
        
        // Só tenta somar se existir uma data válida e ela estiver dentro do período
        if (dTarget && dTarget >= dataIni && dTarget <= dataFim) {
          const valorParcela = Number(parc.valor) || 0;
          
          if(parc.paga) {
            recebidos += valorParcela;
          } else {
            previstosPendentes += valorParcela;
          }

          listaHtml.push(`
            <tr>
              <td>${formatDate(dTarget)}</td>
              <td>${p.nomeProjeto} - ${p.clientName}</td>
              <td style="color:${parc.paga?'#059669':'#d97706'}">
                ${parc.paga ? `PAGO (${parc.formaRecebimento || 'Antigo/Não especificado'})` : 'PENDENTE'}
              </td>
              <td style="text-align:right;">${formatCurrency(valorParcela)}</td>
            </tr>
          `);
        }
      });
    });

    const html = `
      <h1>Relatório Financeiro de Recebimentos</h1>
      <p><strong>Período:</strong> ${formatDate(dataIni)} a ${formatDate(dataFim)}</p>
      
      <table>
        <tr><th>Data (Venc/Receb)</th><th>Projeto/Cliente</th><th>Status</th><th style="text-align:right;">Valor</th></tr>
        ${listaHtml.length > 0 ? listaHtml.join('') : '<tr><td colspan="4" style="text-align:center;">Nenhum lançamento no período.</td></tr>'}
      </table>

      <div class="total-box">
        <div style="font-size:14px; color:#444; font-weight:normal; margin-bottom:5px;">Previsto Não Pago no Período: ${formatCurrency(previstosPendentes)}</div>
        Total Efetivamente Recebido: <span style="color:#059669">${formatCurrency(recebidos)}</span>
      </div>
    `;
    printReport(`Financeiro_${dataIni}_${dataFim}`, html);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-[80] backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-sm flex flex-col shadow-2xl overflow-hidden">
        <div className="p-4 bg-[#1e5aa0] text-white font-bold flex justify-between items-center uppercase">Gerar Extrato <button onClick={onClose}><X size={20}/></button></div>
        <form onSubmit={generateReport} className="p-6 space-y-4">
          <div><label className="text-xs text-slate-500 uppercase font-bold block mb-1">Data Inicial</label><input type="date" required value={dataIni} onChange={e=>setDataIni(e.target.value)} className="w-full border p-2.5 rounded-lg font-medium outline-none" /></div>
          <div><label className="text-xs text-slate-500 uppercase font-bold block mb-1">Data Final</label><input type="date" required value={dataFim} onChange={e=>setDataFim(e.target.value)} className="w-full border p-2.5 rounded-lg font-medium outline-none" /></div>
          <button type="submit" className="w-full bg-[#1e5aa0] text-white font-bold py-3 rounded-xl hover:bg-[#154278] shadow-md flex justify-center items-center gap-2"><Printer size={16}/> Imprimir / Salvar PDF</button>
        </form>
      </div>
    </div>
  );
}

// --- CHECKLISTS E ORÇAMENTOS VINCULADOS A AMBIENTES ---
function ChecklistView({ projects, checklists, companyUsers, canCreate, appUser, documents }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingChk, setEditingChk] = useState(null);
  const [activeTab, setActiveTab] = useState('pendentes'); // NOVA ABA
  
  const myChecklists = useMemo(() => {
    return checklists.filter(c => c.assignedTo === appUser.id || c.assignedTo === 'ALL' || appUser.role === 'gestor')
      .sort((a,b) => {
        if (a.requiresBudget !== b.requiresBudget) return b.requiresBudget ? 1 : -1;
        return new Date(a.dataPrevista) - new Date(b.dataPrevista);
      });
  }, [checklists, appUser]);

  const handleToggleConcluido = async (chk) => {
    // O sistema já grava a data de conclusão automaticamente aqui:
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'checklists', chk.id), { concluido: !chk.concluido, dataConclusao: !chk.concluido ? getToday() : null });
  };
  
  const [confirmData, setConfirmData] = useState(null);
  const handleDelete = (id) => {
    setConfirmData({
      message: 'Excluir esta tarefa permanentemente?',
      onConfirm: async () => { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'checklists', id)); setConfirmData(null); }
    });
  };

  // FILTROS DAS ABAS
  const pendentes = myChecklists.filter(c => !c.concluido);
  const concluidas = myChecklists.filter(c => c.concluido);
  const currentList = activeTab === 'pendentes' ? pendentes : concluidas;

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Tarefas & Orçamentos</h3>
        {canCreate && <button onClick={() => {setEditingChk(null); setIsModalOpen(true);}} className="bg-[#1e5aa0] text-white px-4 py-2.5 rounded-lg font-bold flex items-center space-x-2 shadow-sm hover:bg-[#154278]"><Plus size={18}/><span>Nova Tarefa</span></button>}
      </div>

      {/* ABAS */}
      <div className="flex gap-4 mb-4 border-b border-slate-200 shrink-0">
        <button onClick={() => setActiveTab('pendentes')} className={`pb-3 px-2 text-sm font-black uppercase tracking-wide border-b-2 transition-colors ${activeTab === 'pendentes' ? 'border-[#1e5aa0] text-[#1e5aa0]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
          Pendentes ({pendentes.length})
        </button>
        <button onClick={() => setActiveTab('concluidas')} className={`pb-3 px-2 text-sm font-black uppercase tracking-wide border-b-2 transition-colors ${activeTab === 'concluidas' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
          Concluídas ({concluidas.length})
        </button>
      </div>

      <div className="flex-1 overflow-auto space-y-4 pb-12">
        {currentList.map(chk => (
          <ChecklistCard key={chk.id} chk={chk} projects={projects} users={companyUsers} appUser={appUser} onToggle={()=>handleToggleConcluido(chk)} onEdit={()=>{setEditingChk(chk); setIsModalOpen(true);}} onDelete={()=>handleDelete(chk.id)} allDocs={documents} />
        ))}
        {currentList.length === 0 && <div className="text-center text-slate-400 py-12 font-medium border border-dashed rounded-xl bg-white">Nenhuma tarefa nesta categoria.</div>}
      </div>
      {isModalOpen && <ChecklistModal appUser={appUser} projects={projects} users={companyUsers} editingChk={editingChk} onClose={()=>setIsModalOpen(false)} />}
      {confirmData && <ConfirmModal message={confirmData.message} onConfirm={confirmData.onConfirm} onCancel={() => setConfirmData(null)} />}
    </div>
  );
}

function ChecklistCard({ chk, projects, users, appUser, onToggle, onEdit, onDelete, allDocs }) {
  const p = projects.find(x => x.id === chk.projectId);
  const resp = users.find(x => x.id === chk.assignedTo);
  const [showBudgets, setShowBudgets] = useState(false);
  const chkDocs = allDocs.filter(d => d.checklistId === chk.id);

  const handleApprove = async (budgetIndex) => {
    const b = [...(chk.budgets||[])]; b[budgetIndex].approved = true; b[budgetIndex].approvedAt = getToday();
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'checklists', chk.id), { budgets: b });
  };
  const handleDone = async (budgetIndex) => {
    const b = [...(chk.budgets||[])]; b[budgetIndex].done = true; b[budgetIndex].doneAt = getToday();
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'checklists', chk.id), { budgets: b });
  };

  return (
    <div className={`bg-white rounded-2xl border p-5 shadow-sm transition-all relative ${chk.concluido ? 'border-slate-200 bg-slate-50' : chk.requiresBudget ? 'border-amber-400 shadow-amber-100' : 'border-slate-200 hover:shadow-md'}`}>
      <div className="flex gap-4 items-start">
        <button onClick={onToggle} className="mt-1 transition-transform hover:scale-110">{chk.concluido ? <CheckCircle2 className="text-emerald-500" size={28}/> : <Circle className="text-slate-300 hover:text-[#1e5aa0]" size={28}/>}</button>
        <div className="flex-1">
          <div className="flex justify-between items-start">
            <h4 className={`font-black text-lg ${chk.concluido?'line-through text-slate-500':'text-slate-800'}`}>{chk.descricao}</h4>
            <div className="flex gap-2">
              {chk.requiresBudget && <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase">Orçamento Req.</span>}
              <button onClick={onEdit} className="text-slate-400 hover:text-[#1e5aa0]"><Edit size={16}/></button>
              <button onClick={onDelete} className="text-slate-400 hover:text-red-500"><Trash2 size={16}/></button>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 mt-2 text-xs font-bold">
            <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded border uppercase">{p?.nomeProjeto || 'Projeto Indefinido'}</span>
            <span className="text-slate-500 flex items-center gap-1"><Users size={14}/> Resp: {resp?.nome || 'Todos'}</span>
            <span className={`flex items-center gap-1 ${new Date(chk.dataPrevista) < new Date(getToday()) && !chk.concluido ? 'text-red-600' : 'text-slate-500'}`}><Clock size={14}/> Prev: {formatDate(chk.dataPrevista)}</span>
            
            {/* EXIBIÇÃO DA DATA DE CONCLUSÃO */}
            {chk.concluido && chk.dataConclusao && (
              <span className="text-emerald-600 flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100"><CheckCircle2 size={14}/> Concluída a: {formatDate(chk.dataConclusao)}</span>
            )}

            {!chk.requiresBudget && chk.valor > 0 && <span className="text-emerald-600 flex items-center gap-1"><DollarSign size={14}/> {formatCurrency(chk.valor)}</span>}
          </div>

          {chk.requiresBudget && (
            <div className="mt-4 border-t pt-4">
              <button onClick={()=>setShowBudgets(!showBudgets)} className="w-full bg-amber-50 text-amber-800 font-bold text-xs py-2 rounded-lg border border-amber-200 uppercase tracking-wide">
                {showBudgets ? 'Ocultar Orçamentos' : `Gerenciar Orçamentos (${(chk.budgets||[]).length})`}
              </button>
              {showBudgets && (
                <div className="mt-3 space-y-3">
                  {(chk.budgets||[]).map((b, i) => (
                    <div key={i} className="border border-slate-200 p-4 rounded-xl bg-white shadow-sm flex flex-col md:flex-row justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                           <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded uppercase font-bold border">{b.category}</span>
                           {b.ambienteNome && <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded uppercase font-bold flex items-center gap-1"><LayoutList size={10}/> {b.ambienteNome}</span>}
                        </div>
                        <p className="font-black text-slate-800 text-base">{b.professionalName}</p>
                        <p className="text-xs text-slate-500 mt-1 font-medium">{b.obs}</p>
                        <p className="text-lg font-black text-emerald-600 mt-2">{formatCurrency(b.value)}</p>
                      </div>
                      <div className="flex flex-col gap-2 shrink-0 justify-center border-l pl-4 border-slate-100">
                        {b.approved ? (
                           <div className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-100 flex items-center gap-1"><CheckSquare size={14}/> Aprovado {formatDate(b.approvedAt)}</div>
                        ) : (
                          (appUser.role === 'gestor' || appUser.role === 'operador') && <button onClick={()=>handleApprove(i)} className="bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded shadow hover:bg-emerald-600 transition-colors uppercase">Aprovar Orçamento</button>
                        )}
                        {b.approved && !b.done && (
                          (appUser.role === 'gestor' || appUser.role === 'operador') && <button onClick={()=>handleDone(i)} className="bg-[#1e5aa0] text-white text-xs font-bold px-4 py-2 rounded shadow hover:bg-[#154278] transition-colors uppercase">Marcar Realizado</button>
                        )}
                        {b.done && <div className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-100 flex items-center gap-1"><CheckSquare size={14}/> Realizado {formatDate(b.doneAt)}</div>}
                      </div>
                    </div>
                  ))}
                  <div className="text-right"><button onClick={onEdit} className="text-[10px] font-black uppercase text-[#1e5aa0] hover:underline bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100"><Plus size={12} className="inline"/> Lançar/Editar Orçamentos</button></div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChecklistModal({ appUser, projects, users, editingChk, onClose }) {
  const [formData, setFormData] = useState(editingChk || { projectId: '', descricao: '', dataPrevista: getToday(), assignedTo: 'ALL', requiresBudget: false, valor: '', budgets: [] });
  const [docsToUpload, setDocsToUpload] = useState([]);
  const [alertMsg, setAlertMsg] = useState('');
  
  const pSelecionado = projects.find(p => p.id === formData.projectId);
  const ambientesProjeto = pSelecionado?.ambientes || [];

  const [newBudget, setNewBudget] = useState({ category: 'SERVICO', professionalName: '', obs: '', value: '', ambienteId: '', ambienteNome: '' });
  
  const addBudget = () => {
    if(!newBudget.professionalName || !newBudget.value) return setAlertMsg("Preencha o Nome do Fornecedor e o Valor.");
    
    let aNome = '';
    if(newBudget.ambienteId) { aNome = ambientesProjeto.find(a => a.id === newBudget.ambienteId)?.nome || ''; }

    setFormData({...formData, budgets: [...formData.budgets, {...newBudget, ambienteNome: aNome, value: parseFloat(newBudget.value), approved: false, done: false}]});
    setNewBudget({ category: 'SERVICO', professionalName: '', obs: '', value: '', ambienteId: '', ambienteNome: '' });
  };

  const handleFile = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      if (file.size > 1048000) return setAlertMsg(`O arquivo ${file.name} é maior que 1MB.`);
      const r = new FileReader();
      r.onload = (ev) => setDocsToUpload(prev => [...prev, { nome: file.name, tipo: file.type, size: file.size, b64: ev.target.result }]);
      r.readAsDataURL(file);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.projectId || !formData.descricao) return;
    const data = { ...formData, companyId: appUser.companyId, valor: parseFloat(formData.valor||0) };
    if(!editingChk) data.concluido = false;
    
    try {
      let chkId = editingChk?.id;
      if (editingChk) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'checklists', chkId), data);
      else {
        const ref = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'checklists'), data);
        chkId = ref.id;
      }
      
      for(const docu of docsToUpload) {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'documents'), {
          companyId: appUser.companyId, projectId: formData.projectId, checklistId: chkId, uploadedBy: appUser.id,
          nome: docu.nome, tipo: docu.tipo, tamanho: docu.size, conteudoBase64: docu.b64, dataUpload: new Date().toISOString()
        });
      }
      onClose();
    } catch(err) { console.error(err); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-[80] backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-3xl flex flex-col shadow-2xl max-h-[95vh]">
        <div className="p-4 bg-[#1e5aa0] text-white rounded-t-2xl flex justify-between items-center"><h2 className="font-bold text-lg uppercase">{editingChk ? 'Editar' : 'Nova'} Tarefa</h2><button onClick={onClose}><X size={20}/></button></div>
        <form id="chkform" onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><label className="text-xs font-bold text-slate-500 uppercase">Descrição da Tarefa *</label><input required value={formData.descricao} onChange={e=>setFormData({...formData, descricao: e.target.value})} className="w-full p-2.5 border rounded-lg mt-1 outline-none font-bold text-slate-800 focus:border-[#1e5aa0]" /></div>
            <div><label className="text-xs font-bold text-slate-500 uppercase">Projeto Vinculado *</label><select required value={formData.projectId} onChange={e=>setFormData({...formData, projectId: e.target.value})} className="w-full p-2.5 border rounded-lg bg-white mt-1 outline-none font-bold text-slate-700"><option></option>{projects.map(p=><option key={p.id} value={p.id}>{p.nomeProjeto}</option>)}</select></div>
            <div><label className="text-xs font-bold text-slate-500 uppercase">Atribuir a</label><select value={formData.assignedTo} onChange={e=>setFormData({...formData, assignedTo: e.target.value})} className="w-full p-2.5 border rounded-lg bg-white mt-1 outline-none"><option value="ALL">Toda a Equipa</option>{users.map(u=><option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>
            <div><label className="text-xs font-bold text-slate-500 uppercase">Data Limite *</label><input required type="date" value={formData.dataPrevista} onChange={e=>setFormData({...formData, dataPrevista: e.target.value})} className="w-full p-2.5 border rounded-lg mt-1 outline-none" /></div>
            {!formData.requiresBudget && <div><label className="text-xs font-bold text-slate-500 uppercase">Custo da Tarefa (Opcional - R$)</label><input type="number" step="0.01" value={formData.valor} onChange={e=>setFormData({...formData, valor: e.target.value})} className="w-full p-2.5 border rounded-lg mt-1 outline-none" /></div>}
          </div>
          
          <label className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200 cursor-pointer hover:bg-amber-100 transition-colors">
            <input type="checkbox" checked={formData.requiresBudget} onChange={e=>setFormData({...formData, requiresBudget: e.target.checked})} className="w-5 h-5 accent-amber-600" />
            <span className="font-black text-amber-800 text-sm uppercase">Ativar Controlo de Orçamentos (Cotações para a Obra)</span>
          </label>

          {formData.requiresBudget && (
            <div className="border border-slate-200 rounded-xl p-5 bg-slate-50 shadow-inner">
              <h4 className="font-black text-slate-700 text-sm uppercase mb-4 border-b pb-2 flex items-center gap-2"><DollarSign size={18}/> Inserir Proposta de Orçamento</h4>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div><label className="text-[10px] font-bold text-slate-500 uppercase">Vincular a um Ambiente (Opcional)</label><select value={newBudget.ambienteId} onChange={e=>setNewBudget({...newBudget, ambienteId:e.target.value})} className="w-full p-2.5 border rounded-lg bg-white mt-1 outline-none text-xs font-bold"><option value="">Não vincular (Geral)</option>{ambientesProjeto.map(a=><option key={a.id} value={a.id}>{a.nome}</option>)}</select></div>
                <div><label className="text-[10px] font-bold text-slate-500 uppercase">Categoria</label><select value={newBudget.category} onChange={e=>setNewBudget({...newBudget, category:e.target.value})} className="w-full p-2.5 border rounded-lg bg-white mt-1 outline-none text-xs font-bold"><option value="SERVICO">Serviço/Mão de Obra</option><option value="PRODUTO">Produto/Material</option></select></div>
                <div className="sm:col-span-2"><label className="text-[10px] font-bold text-slate-500 uppercase">Nome Profissional / Fornecedor / Loja *</label><input value={newBudget.professionalName} onChange={e=>setNewBudget({...newBudget, professionalName:e.target.value})} className="w-full p-2.5 border rounded-lg mt-1 outline-none text-sm font-bold" /></div>
                <div><label className="text-[10px] font-bold text-slate-500 uppercase">Valor Orçado (R$) *</label><input type="number" step="0.01" value={newBudget.value} onChange={e=>setNewBudget({...newBudget, value:e.target.value})} className="w-full p-2.5 border rounded-lg mt-1 outline-none text-sm font-black text-[#1e5aa0]" /></div>
                <div><label className="text-[10px] font-bold text-slate-500 uppercase">Detalhes Adicionais</label><input value={newBudget.obs} onChange={e=>setNewBudget({...newBudget, obs:e.target.value})} className="w-full p-2.5 border rounded-lg mt-1 outline-none text-sm" placeholder="Ex: Frete incluído" /></div>
              </div>
              <button type="button" onClick={addBudget} className="w-full bg-[#1e5aa0] text-white font-bold py-3 rounded-lg text-xs uppercase hover:bg-[#154278] shadow flex justify-center items-center gap-1"><Plus size={16}/> Adicionar Orçamento à Lista</button>
              
              {formData.budgets.length > 0 && (
                <div className="mt-6 space-y-2">
                  <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Orçamentos Lançados nesta Tarefa:</h5>
                  {formData.budgets.map((b, i) => (
                    <div key={i} className="bg-white p-3 border rounded-xl flex justify-between items-center shadow-sm">
                      <div className="flex-1 min-w-0 pr-4">
                        <p className="font-black text-sm text-slate-800 truncate">{b.professionalName}</p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase truncate">{b.ambienteNome ? `Ambiente: ${b.ambienteNome}` : 'Geral'} • {formatCurrency(b.value)}</p>
                      </div>
                      <button type="button" onClick={()=>{const n=[...formData.budgets]; n.splice(i,1); setFormData({...formData, budgets: n});}} className="text-slate-300 hover:text-red-500 p-2 bg-slate-50 rounded-lg"><Trash2 size={16}/></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="border-t border-slate-200 pt-4">
            <h4 className="font-bold text-slate-700 text-xs uppercase mb-2">Anexar Documentos Extras (Opcional)</h4>
            <input type="file" multiple onChange={handleFile} className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-[#1e5aa0] hover:file:bg-blue-100 cursor-pointer" />
            <div className="flex gap-2 flex-wrap mt-3">
              {docsToUpload.map((d, i) => <span key={i} className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-1.5 rounded-lg border border-indigo-100 flex items-center gap-1"><FileText size={10}/> {d.nome}</span>)}
            </div>
          </div>
        </form>
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end space-x-3 rounded-b-2xl"><button onClick={onClose} type="button" className="px-6 py-3 rounded-lg font-bold text-slate-600 hover:bg-slate-200">Cancelar</button><button form="chkform" type="submit" className="px-6 py-3 rounded-lg font-bold text-white bg-[#1e5aa0] hover:bg-[#154278] shadow">Salvar Tarefa Completa</button></div>
      </div>
      {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg('')} />}
    </div>
  );
}

// --- MODAIS GERAIS E COMPARTILHADOS ---
function AlertModal({ message, onClose }) {
  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-[9999] backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center animate-in zoom-in-95 duration-200">
        <AlertCircle size={48} className="text-amber-500 mx-auto mb-4" />
        <p className="text-slate-800 font-bold mb-6">{message}</p>
        <button onClick={onClose} className="w-full bg-[#1e5aa0] hover:bg-[#154278] text-white py-3 rounded-xl font-bold transition-colors">Entendi</button>
      </div>
    </div>
  );
}

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-[9999] backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center animate-in zoom-in-95 duration-200">
        <Info size={48} className="text-[#1e5aa0] mx-auto mb-4" />
        <p className="text-slate-800 font-bold mb-6">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-bold transition-colors">Cancelar</button>
          <button onClick={onConfirm} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold transition-colors shadow-sm">Confirmar</button>
        </div>
      </div>
    </div>
  );
}
