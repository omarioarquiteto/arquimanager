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
const generateId = () => Math.random().toString(36).substr(2, 9);
const getToday = () => new Date().toISOString().split('T')[0];

const FASES_ANALITICAS = ['LEVANTAMENTO', 'ESTUDO PRELIMINAR', 'PROJETO CRIATIVO', 'DETALHAMENTO', 'HOMOLOGAÇÃO', 'PROJETO FINALIZADO'];
const SCREENS = [{id: 'dashboard', label: 'Dashboard'}, {id: 'projetos', label: 'Projetos'}, {id: 'recebimentos', label: 'Financeiro'}, {id: 'checklist', label: 'Tarefas & Orçamentos'}, {id: 'clients', label: 'Clientes'}];
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
  const [appUser, setAppUser] = useState(null);
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

  if (loadingAuth) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 font-medium">Conectando ao ArquiManager...</div>;
  if (!appUser || !firebaseUser) return <LoginScreen firebaseUser={firebaseUser} onUnlock={setAppUser} />;

  return <MainLayout firebaseUser={firebaseUser} appUser={appUser} onLogout={() => setAppUser(null)} />;
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

// --- LAYOUT PRINCIPAL E GESTÃO DE ESTADO GLOBAL ---
function MainLayout({ firebaseUser, appUser, onLogout }) {
  const [currentView, setCurrentView] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [targetProjectToEdit, setTargetProjectToEdit] = useState(null);

  const [company, setCompany] = useState(null);
  const [companyUsers, setCompanyUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [checklists, setChecklists] = useState([]);
  const [documents, setDocuments] = useState([]);

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

    return () => { uCompany(); uUsers(); uClients(); uProjects(); uChecklists(); uDocs(); };
  }, [firebaseUser, appUser]);

  const allowedProjects = useMemo(() => {
    if (appUser.role === 'gestor') return projects;
    if (appUser.allowedProjects === 'ALL') return projects;
    const projIds = appUser.allowedProjects || [];
    return projects.filter(p => projIds.includes(p.id));
  }, [projects, appUser]);

  const hasScreenAccess = (screenId) => appUser.role === 'gestor' || (appUser.permissions?.screens || []).includes(screenId);
  const canCreate = appUser.role === 'gestor' || appUser.permissions?.create;
  const canEdit = appUser.role === 'gestor' || appUser.permissions?.edit;
  const canDelete = appUser.role === 'gestor' || appUser.permissions?.delete;

  const renderView = () => {
    if (appUser.role === 'cliente') return <div className="p-8 text-center"><h2 className="text-2xl font-bold text-slate-700">Área do Cliente</h2><p className="text-slate-500">Em breve poderá acompanhar os seus projetos aqui.</p></div>;
    
    switch (currentView) {
      case 'dashboard': return hasScreenAccess('dashboard') ? <DashboardView projects={allowedProjects} checklists={checklists} companyUsers={companyUsers} appUser={appUser} /> : <NoAccess />;
      case 'clients': return hasScreenAccess('clients') ? <ClientsView clients={clients} projects={allowedProjects} canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} appUser={appUser} onOpenProject={(p)=>{setTargetProjectToEdit(p); setCurrentView('projetos');}} /> : <NoAccess />;
      case 'projetos': return hasScreenAccess('projetos') ? <ProjetosView projects={allowedProjects} clients={clients} companyUsers={companyUsers} targetProject={targetProjectToEdit} clearTargetProject={()=>setTargetProjectToEdit(null)} canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} appUser={appUser} documents={documents} checklists={checklists} /> : <NoAccess />;
      case 'recebimentos': return hasScreenAccess('recebimentos') ? <RecebimentosView projects={allowedProjects} canEdit={canEdit} appUser={appUser} /> : <NoAccess />;
      case 'checklist': return hasScreenAccess('checklist') ? <ChecklistView projects={allowedProjects} checklists={checklists} companyUsers={companyUsers} canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} appUser={appUser} documents={documents} /> : <NoAccess />;
      case 'equipe': return appUser.role === 'gestor' ? <EquipeView companyUsers={companyUsers} projects={projects} appUser={appUser} company={company} /> : <NoAccess />;
      default: return <DashboardView projects={allowedProjects} checklists={checklists} companyUsers={companyUsers} appUser={appUser} />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden font-sans">
      {isMobileMenuOpen && <div className="fixed inset-0 bg-slate-900/50 z-30 md:hidden" onClick={()=>setIsMobileMenuOpen(false)}></div>}
      
      <aside className={`fixed md:static inset-y-0 left-0 w-64 bg-slate-900 text-slate-300 flex flex-col transition-transform transform z-40 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-2 text-white"><Building2 size={24} className="text-[#1e5aa0]"/><span className="text-xl font-bold tracking-tight">ARQUI<span className="font-light">MGR</span></span></div>
          <button className="md:hidden text-slate-400" onClick={()=>setIsMobileMenuOpen(false)}><X size={24}/></button>
        </div>
        <div className="px-5 py-4 bg-slate-800/40">
          <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">{appUser.role}</p>
          <p className="text-sm text-white font-bold truncate">{appUser.nome}</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {hasScreenAccess('dashboard') && <SidebarItem icon={<LayoutDashboard size={18}/>} label="Dashboard" active={currentView === 'dashboard'} onClick={() => { setCurrentView('dashboard'); setIsMobileMenuOpen(false); }} />}
          {hasScreenAccess('projetos') && <SidebarItem icon={<FolderKanban size={18}/>} label="Projetos" active={currentView === 'projetos'} onClick={() => { setCurrentView('projetos'); setIsMobileMenuOpen(false); }} />}
          {hasScreenAccess('recebimentos') && <SidebarItem icon={<CalendarDays size={18}/>} label="Financeiro" active={currentView === 'recebimentos'} onClick={() => { setCurrentView('recebimentos'); setIsMobileMenuOpen(false); }} />}
          {hasScreenAccess('checklist') && <SidebarItem icon={<ListTodo size={18}/>} label="Tarefas & Orçamentos" active={currentView === 'checklist'} onClick={() => { setCurrentView('checklist'); setIsMobileMenuOpen(false); }} />}
          {hasScreenAccess('clients') && <SidebarItem icon={<Users size={18}/>} label="Clientes" active={currentView === 'clients'} onClick={() => { setCurrentView('clients'); setIsMobileMenuOpen(false); }} />}
          {appUser.role === 'gestor' && <SidebarItem icon={<Settings size={18}/>} label="Equipa e Acessos" active={currentView === 'equipe'} onClick={() => { setCurrentView('equipe'); setIsMobileMenuOpen(false); }} />}
        </nav>
        <div className="p-4 border-t border-slate-800"><button onClick={onLogout} className="flex items-center space-x-3 text-slate-400 hover:text-white w-full p-2 rounded-lg font-medium transition-colors"><LogOut size={18} /><span>Sair</span></button></div>
      </aside>

      <main className="flex-1 overflow-auto flex flex-col relative w-full">
        <div className="md:hidden bg-slate-900 text-white p-3 flex justify-between items-center shrink-0 z-20 sticky top-0 shadow-md">
          <div className="flex items-center space-x-2"><Building2 size={20} className="text-[#1e5aa0]"/><span className="font-bold tracking-tight">ARQUI<span className="font-light">MGR</span></span></div>
          <button onClick={() => setIsMobileMenuOpen(true)}><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg></button>
        </div>
        <div className="p-4 sm:p-6 flex-1 overflow-auto bg-slate-50">{renderView()}</div>
      </main>
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick }) {
  return <button onClick={onClick} className={`flex items-center space-x-3 w-full p-2.5 rounded-lg transition-all text-sm font-medium ${active ? 'bg-[#1e5aa0] text-white shadow-md' : 'hover:bg-slate-800 hover:text-white text-slate-300'}`}>{icon}<span>{label}</span></button>;
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

// --- DASHBOARD ---
function DashboardView({ projects, checklists, companyUsers, appUser }) {
  const totalValue = projects.reduce((sum, p) => sum + Number(p.valorTotal), 0);
  let received = 0, pending = 0;
  projects.forEach(p => (p.parcelas || []).forEach(parc => { if (parc.paga) received += Number(parc.valor); else pending += Number(parc.valor); }));

  const limitDate = new Date(); limitDate.setDate(limitDate.getDate() + 3);
  const myTasks = checklists.filter(c => !c.concluido && (c.assignedTo === appUser.id || c.assignedTo === 'ALL' || appUser.role === 'gestor') && new Date(c.dataPrevista) <= limitDate).sort((a,b) => new Date(a.dataPrevista) - new Date(b.dataPrevista));

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Contratos Totais" value={formatCurrency(totalValue)} icon={<Wallet className="text-blue-500" />} color="blue" />
        <StatCard title="Total Recebido" value={formatCurrency(received)} icon={<TrendingUp className="text-emerald-500" />} color="emerald" />
        <StatCard title="A Receber" value={formatCurrency(pending)} icon={<CalendarDays className="text-amber-500" />} color="amber" />
        <StatCard title="Projetos Ativos" value={projects.filter(p => p.status === 'EM ANDAMENTO').length} icon={<FolderKanban className="text-indigo-500" />} color="indigo" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col h-96">
          <h3 className="text-lg font-black text-slate-800 uppercase border-b pb-2 mb-4">Evolução dos Projetos</h3>
          <div className="overflow-y-auto space-y-4 pr-2">
            {projects.map(p => {
              const currentFaseIndex = FASES_ANALITICAS.indexOf(p.faseAnalitica || 'LEVANTAMENTO');
              const percent = Math.round(((currentFaseIndex + 1) / FASES_ANALITICAS.length) * 100);
              return (
                <div key={p.id} className="border border-slate-100 p-4 rounded-xl hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-center mb-2"><p className="font-bold text-slate-800 text-sm">{p.nomeProjeto}</p><span className="text-[10px] px-2 py-1 rounded-full font-bold bg-blue-100 text-blue-800">{p.status}</span></div>
                  <div className="flex justify-between text-xs mb-1 font-medium"><span className="text-slate-500">{p.faseAnalitica || 'LEVANTAMENTO'}</span><span className="text-[#1e5aa0] font-black">{percent}%</span></div>
                  <div className="w-full bg-slate-100 rounded-full h-2"><div className="bg-[#1e5aa0] h-2 rounded-full" style={{width: `${percent}%`}}></div></div>
                </div>
              );
            })}
            {projects.length === 0 && <p className="text-slate-400 text-sm text-center pt-8">Nenhum projeto permitido para você.</p>}
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col h-96">
          <h3 className="text-lg font-black text-slate-800 uppercase border-b pb-2 mb-4">Suas Tarefas Pendentes (Até 3 dias)</h3>
          <div className="overflow-y-auto space-y-3 pr-2">
            {myTasks.map(chk => {
              const p = projects.find(proj => proj.id === chk.projectId);
              const isLate = new Date(chk.dataPrevista) < new Date(getToday());
              return (
                <div key={chk.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex gap-3 items-start">
                  <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${isLate ? 'bg-red-500' : 'bg-amber-400'}`}></div>
                  <div className="flex-1"><p className="font-bold text-sm text-slate-800">{chk.descricao}</p><p className="text-[10px] font-bold text-slate-500 uppercase mt-1">{p?.nomeProjeto || 'Projeto Excluído'}</p></div>
                  <div className={`text-xs font-black ${isLate ? 'text-red-600' : 'text-slate-600'}`}>{formatDate(chk.dataPrevista)}</div>
                </div>
              );
            })}
            {myTasks.length === 0 && <div className="text-center text-slate-400 py-12"><CheckCircle2 size={40} className="mx-auto mb-2 text-emerald-400 opacity-50"/><p>Tudo em dia!</p></div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color }) {
  const bgColors = { blue: 'bg-blue-50 text-blue-600', emerald: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600', indigo: 'bg-indigo-50 text-indigo-600' };
  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center space-x-4">
      <div className={`p-4 rounded-xl ${bgColors[color]}`}>{icon}</div>
      <div className="flex-1 min-w-0"><p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{title}</p><p className="text-xl font-black text-slate-800 truncate">{value}</p></div>
    </div>
  );
}

// --- CLIENTES ---
function ClientsView({ clients, projects, canCreate, canEdit, canDelete, appUser, onOpenProject }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [alertMsg, setAlertMsg] = useState('');
  const [confirmData, setConfirmData] = useState(null);

  const handleDelete = (client) => {
    if (projects.some(p => p.clientId === client.id)) return setAlertMsg('Há projetos vinculados a este cliente. Não é possível excluir.');
    setConfirmData({
      message: 'Excluir cliente permanentemente?',
      onConfirm: async () => {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clients', client.id));
        setConfirmData(null);
      }
    });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Clientes</h3>
        {canCreate && <button onClick={() => {setEditingClient(null); setIsModalOpen(true);}} className="bg-[#1e5aa0] text-white px-4 py-2.5 rounded-lg font-bold flex items-center space-x-2 shadow-sm hover:bg-[#154278]"><Plus size={18}/><span>Novo Cliente</span></button>}
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 overflow-auto">
        <table className="w-full text-left text-sm min-w-[600px]">
          <thead className="bg-[#5a82b5] text-white text-xs uppercase sticky top-0"><tr><th className="p-4">Nome</th><th className="p-4">Contato</th><th className="p-4 text-center">Projetos</th><th className="p-4 text-center">Ações</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {clients.map(c => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="p-4 font-bold text-slate-800">{c.nome}</td>
                <td className="p-4"><p className="font-medium text-slate-700">{c.telefone}</p><p className="text-xs text-slate-400">{c.email}</p></td>
                <td className="p-4 text-center"><span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-bold text-xs border border-slate-200">{projects.filter(p=>p.clientId===c.id).length} Projetos</span></td>
                <td className="p-4 text-center space-x-3">
                  {canEdit && <button onClick={() => {setEditingClient(c); setIsModalOpen(true);}} className="text-[#5a82b5] hover:text-[#1e5aa0]"><Edit size={16}/></button>}
                  {canDelete && <button onClick={() => handleDelete(c)} className="text-red-500 hover:text-red-700"><Trash2 size={16}/></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isModalOpen && <ClientModal appUser={appUser} client={editingClient} onClose={()=>setIsModalOpen(false)}/>}
      {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg('')} />}
      {confirmData && <ConfirmModal message={confirmData.message} onConfirm={confirmData.onConfirm} onCancel={() => setConfirmData(null)} />}
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
            <div><label className="text-xs font-bold text-slate-500 uppercase">CPF / CNPJ</label><input value={formData.documento} onChange={e=>setFormData({...formData, documento:e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none" /></div>
          </div>
          <div><label className="text-xs font-bold text-slate-500 uppercase">E-mail</label><input type="email" value={formData.email} onChange={e=>setFormData({...formData, email:e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none" /></div>
          
          <div className="border-t pt-4 mt-2"><h4 className="font-bold text-slate-700 uppercase text-sm mb-4">Endereço do Cliente</h4></div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-1"><label className="text-xs font-bold text-slate-500 uppercase">CEP</label><input value={formData.cep} onChange={e=>setFormData({...formData, cep:e.target.value})} onBlur={handleCepBlur} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none" placeholder="00000-000" /></div>
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
                <div className="sm:col-span-1"><label className="text-xs font-bold text-slate-500 uppercase">CEP</label><input value={formData.cep} onChange={e=>setFormData({...formData, cep:e.target.value})} onBlur={handleCepBlur} disabled={formData.usarEnderecoCliente} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none disabled:bg-slate-100 disabled:text-slate-400" placeholder="00000-000" /></div>
                <div className="sm:col-span-2"><label className="text-xs font-bold text-slate-500 uppercase">Logradouro / Rua</label><input value={formData.logradouro} onChange={e=>setFormData({...formData, logradouro:e.target.value})} disabled={formData.usarEnderecoCliente} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none disabled:bg-slate-100 disabled:text-slate-400" /></div>
                <div className="sm:col-span-1"><label className="text-xs font-bold text-slate-500 uppercase">Número</label><input value={formData.numero} onChange={e=>setFormData({...formData, numero:e.target.value})} disabled={formData.usarEnderecoCliente} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none disabled:bg-slate-100 disabled:text-slate-400" /></div>
                <div className="sm:col-span-1"><label className="text-xs font-bold text-slate-500 uppercase">Complemento</label><input value={formData.complemento} onChange={e=>setFormData({...formData, complemento:e.target.value})} disabled={formData.usarEnderecoCliente} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none disabled:bg-slate-100 disabled:text-slate-400" /></div>
                <div className="sm:col-span-1"><label className="text-xs font-bold text-slate-500 uppercase">Bairro</label><input value={formData.bairro} onChange={e=>setFormData({...formData, bairro:e.target.value})} disabled={formData.usarEnderecoCliente} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none disabled:bg-slate-100 disabled:text-slate-400" /></div>
                <div className="sm:col-span-1"><label className="text-xs font-bold text-slate-500 uppercase">Cidade</label><input value={formData.cidade} onChange={e=>setFormData({...formData, cidade:e.target.value})} disabled={formData.usarEnderecoCliente} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none disabled:bg-slate-100 disabled:text-slate-400" /></div>
                <div className="sm:col-span-1"><label className="text-xs font-bold text-slate-500 uppercase">UF</label><input value={formData.uf} onChange={e=>setFormData({...formData, uf:e.target.value})} disabled={formData.usarEnderecoCliente} className="w-full p-2.5 border rounded-lg focus:ring-2 mt-1 outline-none disabled:bg-slate-100 disabled:text-slate-400 uppercase" maxLength="2" /></div>
              </div>
            </div>

            <div className="md:col-span-2 border-t pt-4 mt-2"><h4 className="font-bold text-slate-700 uppercase text-sm mb-4"><DollarSign size={16} className="inline mr-1 text-emerald-600"/> Financeiro do Contrato (Seus Honorários)</h4></div>
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
function RecebimentosView({ projects, canEdit, appUser }) {
  const [baseDate, setBaseDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [dayModalItems, setDayModalItems] = useState(null); // Itens do dia selecionado
  const [payModalItem, setPayModalItem] = useState(null); // Parcela individual a ser paga
  const [showReportModal, setShowReportModal] = useState(false);
  const [confirmData, setConfirmData] = useState(null);

  const prevMonth = () => setBaseDate(new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 1));
  const nextMonth = () => setBaseDate(new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1));
  const monthsToRender = [baseDate, new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1)];

  const handlePay = async (e) => {
    e.preventDefault();
    const form = e.target;
    const date = form.date.value;
    const formaRecebimento = form.formaRecebimento.value;

    const novas = payModalItem.p.parcelas.map((x, i) => i === payModalItem.index ? {...x, paga: true, dataRecebimento: date, formaRecebimento} : x);
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', payModalItem.pId), { parcelas: novas });
    setPayModalItem(null);
    setDayModalItems(null); // Fecha a listagem do dia
  };
  
  const handleUndo = async (item) => {
    const novas = item.p.parcelas.map((x, i) => i === item.index ? {...x, paga: false, dataRecebimento: null, formaRecebimento: null} : x);
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', item.pId), { parcelas: novas });
    setDayModalItems(null); // Fecha a listagem do dia
  };

  return (
    <div className="h-full flex flex-col space-y-2 overflow-hidden">
      <div className="flex justify-between items-center w-full shrink-0 mb-4">
        <h3 className="text-xl font-bold text-slate-800 uppercase tracking-wide border-b-4 border-[#1e5aa0] pb-0.5">Financeiro (Recebimentos)</h3>
        <div className="flex space-x-2">
          <button onClick={()=>setShowReportModal(true)} className="bg-white border text-[#1e5aa0] px-4 py-2 rounded-lg font-bold text-xs uppercase flex items-center gap-1 shadow-sm hover:bg-blue-50"><FileDown size={16}/> Relatório Mensal</button>
          <button onClick={prevMonth} className="bg-white border border-slate-300 text-slate-700 p-2 rounded-lg hover:bg-slate-100 transition-colors shadow-sm"><ChevronLeft size={18} /></button>
          <button onClick={nextMonth} className="bg-white border border-slate-300 text-slate-700 p-2 rounded-lg hover:bg-slate-100 transition-colors shadow-sm"><ChevronRight size={18} /></button>
        </div>
      </div>
      
      <div className="flex-1 min-h-0 pb-2">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch h-full">
          {monthsToRender.map((monthDate) => (
            <CompactCalendar 
              key={monthDate.toISOString()} 
              currentDate={monthDate} 
              projects={projects} 
              canEdit={canEdit}
              onOpenDayDetails={(items) => setDayModalItems(items)}
            />
          ))}
        </div>
      </div>

      {dayModalItems && !payModalItem && (
        <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-[80] backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg flex flex-col shadow-2xl overflow-hidden max-h-[90vh]">
            <div className="p-4 bg-[#1e5aa0] text-white font-bold flex justify-between items-center uppercase">Lançamentos do Dia <button onClick={()=>setDayModalItems(null)}><X size={20}/></button></div>
            <div className="p-6 overflow-y-auto space-y-3">
              {dayModalItems.map((item, idx) => (
                <div key={idx} className={`p-4 rounded-xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${item.paga ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex-1">
                    <p className="font-black text-slate-800 text-sm uppercase">{item.p.nomeProjeto}</p>
                    <p className="text-xs text-slate-500 uppercase">{item.p.clientName}</p>
                    <p className={`font-black text-lg mt-1 ${item.paga ? 'text-emerald-600' : 'text-amber-600'}`}>{formatCurrency(item.valor)}</p>
                    {item.paga && <p className="text-[10px] text-emerald-700 font-bold mt-1 uppercase">Pago em: {formatDate(item.dataRecebimento)} via {item.formaRecebimento}</p>}
                  </div>
                  {canEdit && (
                    <div className="shrink-0 w-full sm:w-auto">
                      {!item.paga ? (
                        <button onClick={() => setPayModalItem(item)} className="w-full bg-emerald-600 text-white px-5 py-2.5 rounded-lg font-bold text-xs hover:bg-emerald-700 shadow uppercase">Efetuar Baixa</button>
                      ) : (
                        <button onClick={() => {
                          setConfirmData({
                            message: 'Desfazer o recebimento desta parcela?',
                            onConfirm: async () => { await handleUndo(item); setConfirmData(null); }
                          });
                        }} className="w-full bg-white border border-slate-300 text-slate-600 px-5 py-2.5 rounded-lg font-bold text-xs hover:bg-slate-100 shadow-sm uppercase">Desfazer</button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {payModalItem && (
        <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-[90] backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 bg-emerald-600 text-white font-bold flex justify-between items-center uppercase">Confirmar Recebimento <button onClick={()=>setPayModalItem(null)}><X size={20}/></button></div>
            <form onSubmit={handlePay} className="p-6 flex flex-col gap-4">
              <div><p className="text-xs text-slate-500 uppercase font-bold">Projeto</p><p className="font-black text-slate-800">{payModalItem.p.nomeProjeto}</p></div>
              <div><p className="text-xs text-slate-500 uppercase font-bold">Valor da Parcela</p><p className="font-black text-2xl text-emerald-600">{formatCurrency(payModalItem.valor)}</p></div>

              <div>
                <label className="text-xs text-slate-500 uppercase font-bold mb-1 block">Forma de Recebimento *</label>
                <select name="formaRecebimento" required className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-sm bg-white text-slate-800">
                  <option value="">Selecione...</option>
                  <option value="PIX">PIX</option>
                  <option value="DINHEIRO">DINHEIRO</option>
                  <option value="CREDITO EM CONTA">CRÉDITO EM CONTA</option>
                  <option value="CHEQUE">CHEQUE</option>
                  <option value="PERMUTA">PERMUTA</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-500 uppercase font-bold mb-1 block">Data em que o cliente pagou *</label>
                <div className="flex gap-2">
                  <button type="button" onClick={()=>{document.getElementById('pDate').value=getToday();}} className="bg-slate-100 font-bold text-slate-600 px-3 py-2 rounded-lg text-xs hover:bg-slate-200">Hoje</button>
                  <input id="pDate" required name="date" type="date" defaultValue={getToday()} className="flex-1 border p-2 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-sm" />
                </div>
              </div>
              
              <button type="submit" className="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl mt-2 hover:bg-emerald-700 shadow-md">Confirmar Baixa</button>
            </form>
          </div>
        </div>
      )}

      {showReportModal && <FinancialReportModal projects={projects} onClose={()=>setShowReportModal(false)} />}
      {confirmData && <ConfirmModal message={confirmData.message} onConfirm={confirmData.onConfirm} onCancel={() => setConfirmData(null)} />}
    </div>
  );
}

function CompactCalendar({ currentDate, projects, canEdit, onOpenDayDetails }) {
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
  let monthTotalPaid = 0, monthTotalPending = 0;
  
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

  return (
    <div className="bg-white rounded-xl shadow-md border border-slate-200 flex flex-col h-full overflow-hidden">
      <div className="bg-[#5a82b5] text-white p-1.5 sm:p-2 text-center font-bold uppercase text-xs sm:text-sm tracking-widest shrink-0">{currentDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}</div>
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 shrink-0">{weekDays.map((d, i) => <div key={i} className="text-center py-1 sm:py-1.5 text-[9px] sm:text-[10px] font-bold text-slate-500 border-r border-slate-200 last:border-r-0 uppercase">{d}</div>)}</div>
      <div className="grid grid-cols-7 auto-rows-fr bg-white flex-1 min-h-0">
        {days.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} className="border-r border-b border-slate-100 bg-slate-50"></div>;
          const dayInstallments = installmentsThisMonth[day] || [];
          const totalValue = dayInstallments.reduce((sum, item) => sum + Number(item.valor), 0);
          const hasInstallments = dayInstallments.length > 0;
          const allPaid = hasInstallments && dayInstallments.every(item => item.paga);
          let bgClass = "bg-white";
          if (hasInstallments && allPaid) bgClass = "bg-[#d4edd9]"; else if (hasInstallments && !allPaid) bgClass = "bg-[#fff3cd]";
          
          const handleDayClick = () => {
            if (!hasInstallments || !canEdit) return;
            onOpenDayDetails(dayInstallments);
          };

          return (
            <div key={day} className={`border-r border-b border-slate-200 p-1 sm:p-1.5 flex flex-col justify-between overflow-hidden ${bgClass} ${hasInstallments ? 'cursor-pointer hover:brightness-95 transition-all' : ''}`} onClick={handleDayClick}>
              <div className="flex justify-between items-start mb-0.5 shrink-0">
                <span className="font-bold text-[10px] sm:text-xs text-slate-800 leading-none">{day}</span>
                {hasInstallments && <div className={`w-3.5 h-3.5 border rounded flex items-center justify-center transition-colors ${allPaid ? 'bg-[#73c87f] border-[#73c87f]' : 'bg-white border-[#73c87f]'}`}>{allPaid && <Check size={10} className="text-white font-bold" />}</div>}
              </div>
              <div className="flex-1 flex flex-col justify-end overflow-hidden min-h-0">
                <div className="flex flex-col gap-px overflow-hidden">
                  {dayInstallments.slice(0, 2).map((inst, i) => <div key={i} className={`text-[8px] sm:text-[9px] truncate font-semibold leading-tight ${inst.paga ? 'text-green-800 opacity-60 line-through' : 'text-slate-700'}`}>{inst.p.clientName.split(' ')[0]}</div>)}
                </div>
                {dayInstallments.length > 2 && <div className="text-[8px] sm:text-[9px] font-bold text-slate-500 shrink-0">+{dayInstallments.length - 2}</div>}
                {hasInstallments && <div className={`text-right text-[9px] sm:text-[10px] md:text-[11px] font-black mt-0.5 truncate shrink-0 ${allPaid ? 'text-green-900' : 'text-amber-900'}`}>{formatCurrency(totalValue)}</div>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="bg-slate-50 border-t border-slate-200 p-2 sm:p-2.5 grid grid-cols-2 gap-2 shrink-0">
        <div className="flex flex-col"><span className="text-[8px] sm:text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5 flex items-center gap-1 truncate"><Check size={10} className="text-green-600 shrink-0" /> Recebidos</span><span className="text-green-700 font-black text-xs sm:text-sm truncate" title={formatCurrency(monthTotalPaid)}>{formatCurrency(monthTotalPaid)}</span></div>
        <div className="flex flex-col text-right border-l border-slate-200 pl-2"><span className="text-[8px] sm:text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5 flex justify-end items-center gap-1 truncate">A Receber <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block shrink-0"></span></span><span className="text-amber-600 font-black text-xs sm:text-sm truncate" title={formatCurrency(monthTotalPending)}>{formatCurrency(monthTotalPending)}</span></div>
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