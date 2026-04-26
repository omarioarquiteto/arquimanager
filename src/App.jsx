import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { 
  LayoutDashboard, 
  Users, 
  FolderKanban, 
  CalendarDays, 
  LogOut, 
  Plus, 
  X, 
  Check,
  ChevronLeft,
  ChevronRight,
  Building2,
  Wallet,
  TrendingUp,
  AlertCircle,
  Edit,
  Trash2,
  Info,
  ListTodo,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  Upload,
  Eye,
  FolderOpen,
  Settings,
  Briefcase,
  UserPlus,
  ShieldCheck,
  CreditCard,
  Paperclip,
  DollarSign,
  BriefcaseBusiness,
  Settings2,
  HardHat,
  MapPin
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

// VOU PRECISA GARANTIR QUE ESTAS 4 LINHAS ESTEJAM EXATAMENTE AQUI:
const app = initializeApp(firebaseConfig);
const auth = getAuth(app); // <-- O seu código está sentindo falta desta linha!
const db = getFirestore(app);
const appId = 'arquimanager-producao';

// --- UTILITÁRIOS, MÁSCARAS E VALIDAÇÕES ---
const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const formatDate = (dateString) => {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-');
  return `${day}/${month}/${year.slice(2)}`;
};
const generateId = () => Math.random().toString(36).substr(2, 9);
const getToday = () => new Date().toISOString().split('T')[0];

const maskPhone = (v) => {
  if (!v) return '';
  v = v.replace(/\D/g, "");
  if (v.length <= 10) return v.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").replace(/-$/, "");
  return v.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3").replace(/-$/, "");
};
const maskCPF = (v) => {
  if (!v) return '';
  v = v.replace(/\D/g, "").slice(0, 11);
  return v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4").replace(/(-\d{2})\d+?$/, "$1");
};
const maskCEP = (v) => {
  if (!v) return '';
  v = v.replace(/\D/g, "").slice(0, 8);
  return v.replace(/(\d{5})(\d{0,3})/, "$1-$2").replace(/-$/, "");
};
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const FASES_ANALITICAS = ['LEVANTAMENTO', 'ESTUDO PRELIMINAR', 'PROJETO CRIATIVO', 'DETALHAMENTO', 'HOMOLOGAÇÃO', 'PROJETO FINALIZADO'];
const ESTADOS_BR = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO','EX'];
const SCREENS = [
  {id: 'dashboard', label: 'Dashboard'}, 
  {id: 'projetos', label: 'Projetos'}, 
  {id: 'recebimentos', label: 'Financeiro'}, 
  {id: 'checklist', label: 'Tarefas & Orçamentos'}, 
  {id: 'clients', label: 'Clientes'}
];
const FORMAS_RECEBIMENTO = ["PIX", "DINHEIRO", "CREDITO EM CONTA", "CHEQUE", "PERMUTA"];

// --- COMPONENTE PRINCIPAL ---
export default function App() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [appUser, setAppUser] = useState(null);

  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Erro Auth:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setFirebaseUser(currentUser);
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  if (loadingAuth) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 font-medium">Conectando ao ArquiManager Seguro...</div>;
  
  if (!appUser || !firebaseUser) return <LoginScreen firebaseUser={firebaseUser} onUnlock={setAppUser} />;

  return <MainLayout firebaseUser={firebaseUser} appUser={appUser} onLogout={() => setAppUser(null)} />;
}

// --- TELA DE LOGIN ---
function LoginScreen({ firebaseUser, onUnlock }) {
  const [view, setView] = useState('login'); 
  const [error, setError] = useState('');
  const [loadingLogin, setLoadingLogin] = useState(false);
  
  const [loginEmail, setLoginEmail] = useState('');
  const [loginSenha, setLoginSenha] = useState('');
  
  const [empresaNome, setEmpresaNome] = useState('');
  const [empresaCnpj, setEmpresaCnpj] = useState('');
  const [regNome, setRegNome] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regSenha, setRegSenha] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoadingLogin(true);

    try {
      const accSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'app_accounts'));
      const accounts = accSnap.docs.map(d => ({id: d.id, ...d.data()}));
      const account = accounts.find(a => a.email === loginEmail && a.senha === loginSenha);

      if (account) {
        onUnlock(account);
      } else {
        setError('E-mail ou senha incorretos.');
      }
    } catch (err) {
      setError('Erro ao validar acesso. Tente novamente.');
      console.error(err);
    }
    setLoadingLogin(false);
  };

  const handleRegisterOffice = async (e) => {
    e.preventDefault();
    setError('');
    setLoadingLogin(true);

    if (!empresaNome || !empresaCnpj || !regNome || !regEmail || !regSenha) {
      setError('Preencha todos os campos obrigatórios.');
      setLoadingLogin(false); return;
    }

    try {
      const accSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'app_accounts'));
      if (accSnap.docs.some(d => d.data().email === regEmail)) {
        setError('Este e-mail já está em uso por outro escritório.');
        setLoadingLogin(false); return;
      }

      const workspaceId = `ws_${Date.now().toString(36)}_${generateId()}`;

      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'company_info'), { 
        workspaceId, nome: empresaNome, cnpj: empresaCnpj, dataCriacao: new Date().toISOString() 
      });

      const newGestor = { 
        workspaceId, nome: regNome, email: regEmail, senha: regSenha, role: 'gestor', 
        permissions: { create: true, edit: true, delete: true, screens: SCREENS.map(s => s.id) }, allowedProjects: 'ALL' 
      };
      
      const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'app_accounts'), newGestor);
      
      onUnlock({ id: docRef.id, ...newGestor });
    } catch (err) {
      setError('Erro ao configurar escritório.');
      console.error(err);
    }
    setLoadingLogin(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-200">
        <div className="flex flex-col items-center mb-6">
          <div className="bg-[#1e5aa0] p-4 rounded-xl text-white mb-4 shadow-lg shadow-blue-900/20"><Building2 size={40} /></div>
          <h1 className="text-2xl font-black text-slate-800 text-center tracking-tight">ArquiManager</h1>
          <p className="text-slate-500 text-sm text-center font-medium">Acesso Restrito ao Escritório</p>
        </div>
        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 font-medium border border-red-100 flex items-center"><AlertCircle size={16} className="mr-2 shrink-0"/> {error}</div>}
        {view === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div><label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wide">E-mail Corporativo</label><input type="email" required value={loginEmail} onChange={e => setLoginEmail(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1e5aa0] outline-none transition-all" placeholder="seu@email.com" /></div>
            <div><label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wide">Senha</label><input type="password" required value={loginSenha} onChange={e => setLoginSenha(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1e5aa0] outline-none transition-all" placeholder="••••••••" /></div>
            <button type="submit" disabled={loadingLogin} className="w-full bg-[#1e5aa0] text-white font-bold py-3 rounded-lg hover:bg-[#154278] transition-colors shadow-md mt-2 disabled:opacity-50">{loadingLogin ? 'Validando...' : 'Acessar Sistema'}</button>
            <div className="text-center pt-6 border-t border-slate-100 mt-6"><button type="button" onClick={() => {setView('registerOffice'); setError('');}} className="text-sm text-[#1e5aa0] hover:text-[#154278] font-bold">Cadastrar minha empresa (Novo Escritório)</button></div>
          </form>
        ) : (
          <form onSubmit={handleRegisterOffice} className="space-y-4">
            <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg text-xs text-blue-800 font-medium mb-4 flex gap-2"><Building2 className="shrink-0 text-blue-600" size={20}/><span>Configure seu escritório. O cadastro de funcionários será feito internamente após o login.</span></div>
            <div className="border-b border-slate-100 pb-4 mb-4">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Dados da Empresa</h3>
              <div className="space-y-3">
                <div><label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wide">Nome do Escritório *</label><input type="text" required value={empresaNome} onChange={e => setEmpresaNome(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1e5aa0] outline-none" /></div>
                <div><label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wide">CNPJ *</label><input type="text" required value={empresaCnpj} onChange={e => setEmpresaCnpj(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1e5aa0] outline-none" /></div>
              </div>
            </div>
            <div>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Dados do Gestor (Acesso)</h3>
              <div className="space-y-3">
                <div><label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wide">Seu Nome *</label><input type="text" required value={regNome} onChange={e => setRegNome(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1e5aa0] outline-none" /></div>
                <div><label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wide">E-mail *</label><input type="email" required value={regEmail} onChange={e => setRegEmail(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1e5aa0] outline-none" /></div>
                <div><label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wide">Senha *</label><input type="password" required value={regSenha} onChange={e => setRegSenha(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1e5aa0] outline-none" /></div>
              </div>
            </div>
            <button type="submit" disabled={loadingLogin} className="w-full bg-[#1e5aa0] text-white font-bold py-3 rounded-lg hover:bg-[#154278] transition-colors shadow-md mt-4 disabled:opacity-50">{loadingLogin ? 'Criando Ambiente...' : 'Finalizar Cadastro e Entrar'}</button>
            <div className="text-center pt-2"><button type="button" onClick={() => {setView('login'); setError('');}} className="text-sm text-slate-500 hover:text-slate-700 font-bold">Voltar para o Login</button></div>
          </form>
        )}
      </div>
    </div>
  );
}

// --- LAYOUT PRINCIPAL ---
function MainLayout({ firebaseUser, appUser, onLogout }) {
  const workspaceId = appUser.workspaceId; 
  
  const [currentView, setCurrentView] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [checklists, setChecklists] = useState([]);
  const [companyInfo, setCompanyInfo] = useState(null);
  const [companyUsers, setCompanyUsers] = useState([]);
  
  const [targetProjectToEdit, setTargetProjectToEdit] = useState(null);

  useEffect(() => {
    if (!workspaceId) return;
    
    const baseCol = (colName) => collection(db, 'artifacts', appId, 'public', 'data', colName);
    const extract = (snap) => snap.docs.map(d => ({id: d.id, ...d.data()})).filter(d => d.workspaceId === workspaceId);
    const errHandler = (err) => console.error("Firestore Listener Error:", err);

    const uClients = onSnapshot(baseCol('clients'), snap => setClients(extract(snap)), errHandler);
    const uProjects = onSnapshot(baseCol('projects'), snap => setProjects(extract(snap)), errHandler);
    const uChecklists = onSnapshot(baseCol('checklists'), snap => setChecklists(extract(snap)), errHandler);
    const uUsers = onSnapshot(baseCol('app_accounts'), snap => setCompanyUsers(extract(snap)), errHandler);
    
    const uCompany = onSnapshot(baseCol('company_info'), snap => { 
      const info = snap.docs.map(d => ({id: d.id, ...d.data()})).find(d => d.workspaceId === workspaceId);
      if (info) setCompanyInfo(info); 
    }, errHandler);

    return () => { uClients(); uProjects(); uChecklists(); uUsers(); uCompany(); };
  }, [workspaceId]);

  const hasScreenAccess = (screenId) => appUser.role === 'gestor' || (appUser.permissions?.screens || []).includes(screenId);

  const allowedProjects = useMemo(() => {
    if (appUser.role === 'gestor') return projects;
    if (appUser.allowedProjects === 'ALL') return projects;
    const projIds = appUser.allowedProjects || [];
    return projects.filter(p => projIds.includes(p.id));
  }, [projects, appUser]);

  const closeMenu = () => setIsMobileMenuOpen(false);

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return hasScreenAccess('dashboard') ? <DashboardView projects={allowedProjects} checklists={checklists} /> : <NoAccess />;
      case 'projetos': return hasScreenAccess('projetos') ? <ProjetosView workspaceId={workspaceId} projects={allowedProjects} clients={clients} companyUsers={companyUsers} targetProject={targetProjectToEdit} clearTargetProject={() => setTargetProjectToEdit(null)} appUser={appUser} /> : <NoAccess />;
      case 'recebimentos': return hasScreenAccess('recebimentos') ? <RecebimentosView workspaceId={workspaceId} projects={allowedProjects} appUser={appUser} /> : <NoAccess />;
      case 'checklist': return hasScreenAccess('checklist') ? <ChecklistView workspaceId={workspaceId} projects={allowedProjects} checklists={checklists} companyUsers={companyUsers} appUser={appUser} /> : <NoAccess />;
      case 'clients': return hasScreenAccess('clients') ? <ClientsView workspaceId={workspaceId} clients={clients} projects={allowedProjects} onOpenProject={(p)=>{setTargetProjectToEdit(p); setCurrentView('projetos');}} appUser={appUser} /> : <NoAccess />;
      case 'equipe': return appUser.role === 'gestor' ? <EquipeView workspaceId={workspaceId} companyUsers={companyUsers} projects={projects} appUser={appUser} /> : <NoAccess />;
      case 'minha-empresa': return appUser.role === 'gestor' ? <MinhaEmpresaView workspaceId={workspaceId} companyInfo={companyInfo} /> : <NoAccess />;
      default: return <DashboardView projects={allowedProjects} checklists={checklists} />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden font-sans">
      {isMobileMenuOpen && <div className="fixed inset-0 bg-slate-900/50 z-30 md:hidden" onClick={closeMenu}></div>}

      <aside className={`fixed md:static inset-y-0 left-0 w-64 bg-slate-900 text-slate-300 flex flex-col transition-transform transform z-40 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-6 flex items-center justify-between space-x-3 text-white border-b border-slate-800 shrink-0">
          <div className="flex items-center space-x-3"><Building2 size={28} className="text-[#1e5aa0]" /><span className="text-xl font-bold tracking-tight">ARQUI<span className="font-light">MGR</span></span></div>
          <button className="md:hidden text-slate-400 hover:text-white" onClick={closeMenu}><X size={24}/></button>
        </div>

        <div className="px-6 py-4 bg-slate-800/50 shrink-0">
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">{appUser.role}</p>
          <p className="text-sm text-white font-bold truncate">{appUser.nome}</p>
          <p className="text-[10px] text-slate-500 mt-1 truncate">{companyInfo?.nome || 'Escritório'}</p>
        </div>
        
        <nav className="flex-1 px-4 py-2 space-y-1 overflow-y-auto">
          {hasScreenAccess('dashboard') && <SidebarItem icon={<LayoutDashboard size={18} />} label="Dashboard" active={currentView === 'dashboard'} onClick={() => { setCurrentView('dashboard'); closeMenu(); }} />}
          {hasScreenAccess('projetos') && <SidebarItem icon={<FolderKanban size={18} />} label="Projetos" active={currentView === 'projetos'} onClick={() => { setCurrentView('projetos'); closeMenu(); }} />}
          {hasScreenAccess('recebimentos') && <SidebarItem icon={<CalendarDays size={18} />} label="Financeiro" active={currentView === 'recebimentos'} onClick={() => { setCurrentView('recebimentos'); closeMenu(); }} />}
          {hasScreenAccess('checklist') && <SidebarItem icon={<ListTodo size={18} />} label="Tarefas" active={currentView === 'checklist'} onClick={() => { setCurrentView('checklist'); closeMenu(); }} />}
          {hasScreenAccess('clients') && <SidebarItem icon={<Users size={18} />} label="Clientes" active={currentView === 'clients'} onClick={() => { setCurrentView('clients'); closeMenu(); }} />}
          
          {appUser.role === 'gestor' && (
            <div className="pt-4 mt-4 border-t border-slate-800 space-y-1">
              <SidebarItem icon={<Settings size={18} />} label="Equipe e Acessos" active={currentView === 'equipe'} onClick={() => { setCurrentView('equipe'); closeMenu(); }} />
              <SidebarItem icon={<Briefcase size={18} />} label="Minha Empresa" active={currentView === 'minha-empresa'} onClick={() => { setCurrentView('minha-empresa'); closeMenu(); }} />
            </div>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800 shrink-0"><button onClick={onLogout} className="flex items-center space-x-3 text-slate-400 hover:text-white w-full p-2 rounded-lg transition-colors font-medium"><LogOut size={18} /><span>Sair do Sistema</span></button></div>
      </aside>

      <main className="flex-1 overflow-auto flex flex-col w-full relative bg-slate-50">
        <div className="md:hidden bg-slate-900 text-white p-3 flex justify-between items-center shrink-0 z-20 sticky top-0 shadow-md">
          <div className="flex items-center space-x-2"><Building2 size={20} className="text-[#1e5aa0]" /><span className="font-bold tracking-tight">ARQUI<span className="font-light">MGR</span></span></div>
          <button onClick={() => setIsMobileMenuOpen(true)}><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg></button>
        </div>
        <div className="p-4 sm:p-6 flex-1 overflow-auto">{renderView()}</div>
      </main>
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick }) {
  return <button onClick={onClick} className={`flex items-center space-x-3 w-full p-2.5 rounded-lg transition-all text-sm font-medium ${active ? 'bg-[#1e5aa0] text-white shadow-md' : 'hover:bg-slate-800 hover:text-white text-slate-300'}`}>{icon}<span>{label}</span></button>;
}

function NoAccess() {
  return <div className="h-full flex flex-col items-center justify-center text-slate-400"><ShieldCheck size={64} className="mb-4 opacity-50"/><p className="text-lg font-bold">Acesso Restrito</p><p className="text-sm">Você não tem permissão para visualizar esta tela.</p></div>;
}

// --- VISÃO: EQUIPE E ACESSOS ---
function EquipeView({ workspaceId, companyUsers, projects, appUser }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [alertMsg, setAlertMsg] = useState('');
  const [confirmData, setConfirmData] = useState(null);

  const handleDelete = (u) => {
    if (u.id === appUser.id) return setAlertMsg("Você não pode excluir sua própria conta de Gestor.");
    setConfirmData({
      message: `Remover o acesso de ${u.nome} do sistema?`,
      onConfirm: async () => {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'app_accounts', u.id));
        setConfirmData(null);
      }
    });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div><h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Equipe & Acessos</h3><p className="text-slate-500 text-sm">Cadastre seus funcionários e gerencie permissões.</p></div>
        <button onClick={() => {setEditingUser(null); setIsModalOpen(true);}} className="bg-[#1e5aa0] text-white px-4 py-2.5 rounded-lg font-bold flex items-center space-x-2 shadow-sm hover:bg-[#154278] transition-colors"><UserPlus size={18}/><span>Novo Funcionário</span></button>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm flex-1 overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#5a82b5] text-white text-xs uppercase sticky top-0"><tr><th className="p-3">Funcionário</th><th className="p-3">Cargo</th><th className="p-3">Permissões</th><th className="p-3 text-center">Ações</th></tr></thead>
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
      {isModalOpen && <UserModal workspaceId={workspaceId} projects={projects} editingUser={editingUser} onClose={()=>setIsModalOpen(false)} setAlertMsg={setAlertMsg} />}
      {alertMsg && <AlertModal title="Aviso" message={alertMsg} onClose={() => setAlertMsg('')} />}
      {confirmData && <ConfirmModal title="Confirmação" message={confirmData.message} onConfirm={confirmData.onConfirm} onCancel={() => setConfirmData(null)} />}
    </div>
  );
}

function UserModal({ workspaceId, projects, editingUser, onClose, setAlertMsg }) {
  const [formData, setFormData] = useState(editingUser || {
    nome: '', email: '', senha: '', role: 'operador',
    permissions: { create: false, edit: false, delete: false, screens: ['dashboard'] }, allowedProjects: []
  });
  const [isSaving, setIsSaving] = useState(false);

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
    setIsSaving(true);
    const data = { ...formData, workspaceId };
    if (data.role === 'gestor') { data.permissions = { create: true, edit: true, delete: true, screens: SCREENS.map(s=>s.id) }; data.allowedProjects = 'ALL'; }
    
    try {
      if (editingUser) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'app_accounts', editingUser.id), data);
      } else {
        const accSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'app_accounts'));
        if (accSnap.docs.some(d => d.data().email === data.email)) {
          setAlertMsg('Este e-mail já está sendo utilizado em outra conta do sistema.');
          setIsSaving(false); return;
        }
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'app_accounts'), data);
      }
      onClose();
    } catch(err) { console.error(err); setAlertMsg("Erro ao salvar usuário."); }
    setIsSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-[80] backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="p-4 bg-[#1e5aa0] text-white rounded-t-2xl flex justify-between items-center"><h2 className="font-bold text-lg uppercase">{editingUser ? 'Editar' : 'Novo'} Funcionário</h2><button onClick={onClose}><X size={20}/></button></div>
        <form id="uform" onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6">
          <div className="bg-blue-50 text-blue-800 p-3 rounded-lg text-xs font-medium flex items-center gap-2"><Info size={16} className="shrink-0"/> Ao cadastrar, este funcionário já poderá fazer login pelo celular dele usando E-mail e Senha.</div>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><label className="text-xs font-bold text-slate-500 uppercase">Nome Completo</label><input required value={formData.nome} onChange={e=>setFormData({...formData, nome: e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 outline-none mt-1" /></div>
            <div><label className="text-xs font-bold text-slate-500 uppercase">E-mail de Acesso</label><input required type="email" value={formData.email} onChange={e=>setFormData({...formData, email: e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 outline-none mt-1" disabled={!!editingUser} /></div>
            <div><label className="text-xs font-bold text-slate-500 uppercase">Senha</label><input required type="text" value={formData.senha} onChange={e=>setFormData({...formData, senha: e.target.value})} className="w-full p-2.5 border rounded-lg focus:ring-2 outline-none mt-1" /></div>
            <div className="col-span-2"><label className="text-xs font-bold text-slate-500 uppercase">Cargo no Escritório</label>
              <select value={formData.role} onChange={e=>setFormData({...formData, role: e.target.value})} className="w-full p-2.5 border rounded-lg bg-white mt-1 outline-none font-bold">
                <option value="gestor">Gestor (Acesso Total)</option><option value="operador">Arquiteto / Operador</option><option value="prestador">Estagiário / Prestador</option>
              </select>
            </div>
          </div>
          {formData.role !== 'gestor' && (
            <div className="space-y-4 border-t pt-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Telas Permitidas para este funcionário</label>
                <div className="flex flex-wrap gap-2">{SCREENS.map(s => <button type="button" key={s.id} onClick={()=>toggleScreen(s.id)} className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${formData.permissions.screens.includes(s.id) ? 'bg-[#1e5aa0] text-white border-[#1e5aa0]' : 'bg-white text-slate-500'}`}>{s.label}</button>)}</div>
              </div>
              <div className="flex gap-4 p-4 bg-slate-50 rounded-xl border flex-wrap">
                <label className="flex items-center gap-2 text-sm font-bold text-slate-700"><input type="checkbox" checked={formData.permissions.create} onChange={e=>setFormData({...formData, permissions: {...formData.permissions, create: e.target.checked}})} className="w-4 h-4" /> Permitir ADICIONAR registros</label>
                <label className="flex items-center gap-2 text-sm font-bold text-slate-700"><input type="checkbox" checked={formData.permissions.edit} onChange={e=>setFormData({...formData, permissions: {...formData.permissions, edit: e.target.checked}})} className="w-4 h-4" /> Permitir EDITAR registros</label>
                <label className="flex items-center gap-2 text-sm font-bold text-red-700"><input type="checkbox" checked={formData.permissions.delete} onChange={e=>setFormData({...formData, permissions: {...formData.permissions, delete: e.target.checked}})} className="w-4 h-4" /> Permitir EXCLUIR</label>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2"><label className="text-xs font-bold text-slate-500 uppercase">Projetos Visíveis</label><button type="button" onClick={()=>setFormData({...formData, allowedProjects: 'ALL'})} className="text-xs font-bold text-blue-600 hover:underline">Selecionar Todos</button></div>
                <div className="max-h-32 overflow-y-auto border rounded-lg divide-y bg-slate-50">
                  {projects.map(p => (
                    <label key={p.id} className="flex items-center gap-3 p-3 hover:bg-white cursor-pointer text-sm transition-colors">
                      <input type="checkbox" checked={formData.allowedProjects === 'ALL' || (formData.allowedProjects || []).includes(p.id)} onChange={()=>toggleProject(p.id)} className="w-4 h-4" />
                      <span className="font-bold text-slate-700">{p.nomeProjeto}</span><span className="text-xs text-slate-400">({p.clientName})</span>
                    </label>
                  ))}
                  {projects.length === 0 && <p className="text-xs text-slate-400 p-3 text-center">Nenhum projeto cadastrado na empresa.</p>}
                </div>
              </div>
            </div>
          )}
        </form>
        <div className="p-4 border-t bg-slate-50 flex justify-end space-x-2 rounded-b-2xl"><button onClick={onClose} type="button" className="px-5 py-2.5 rounded-lg font-bold text-slate-600 hover:bg-slate-200">Cancelar</button><button form="uform" type="submit" disabled={isSaving} className="px-5 py-2.5 rounded-lg font-bold text-white bg-[#1e5aa0] hover:bg-[#154278] disabled:opacity-50">{isSaving ? 'Salvando...' : 'Salvar Funcionário'}</button></div>
      </div>
    </div>
  );
}

// --- VISÃO: MINHA EMPRESA ---
function MinhaEmpresaView({ workspaceId, companyInfo }) {
  const [formData, setFormData] = useState({ nome: '', cnpj: '', emailContato: '', telefone: '', endereco: '', ...companyInfo });
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => { if (companyInfo) setFormData(prev => ({ ...prev, ...companyInfo })); }, [companyInfo]);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (companyInfo?.id) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'company_info', companyInfo.id), formData);
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'company_info'), { ...formData, workspaceId });
      }
      setSuccessMsg('Dados da empresa atualizados com sucesso!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (error) { console.error(error); }
    setIsSaving(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pt-2">
      <div className="flex justify-between items-center border-b-4 border-[#1e5aa0] pb-2"><h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Minha Empresa</h3></div>
      {successMsg && <div className="bg-emerald-50 text-emerald-700 border border-emerald-200 p-4 rounded-xl flex items-center shadow-sm font-bold"><CheckCircle2 className="mr-2" size={20} /> {successMsg}</div>}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
        <div className="flex items-center space-x-4 mb-6 pb-6 border-b border-slate-100">
          <div className="bg-blue-50 text-[#1e5aa0] p-4 rounded-full"><Building2 size={32} /></div>
          <div><h4 className="text-lg font-bold text-slate-800">Dados do Escritório</h4><p className="text-sm text-slate-500">Informações fiscais e de contato da sua empresa.</p></div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Razão Social / Nome Fantasia *</label><input required type="text" name="nome" value={formData.nome} onChange={handleChange} className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1e5aa0] outline-none font-semibold text-slate-800" /></div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1 uppercase">CNPJ *</label><input required type="text" name="cnpj" value={formData.cnpj} onChange={handleChange} className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1e5aa0] outline-none font-medium" /></div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Telefone Comercial</label><input type="text" name="telefone" value={formData.telefone} onChange={handleChange} className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1e5aa0] outline-none" /></div>
            <div className="md:col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Endereço Completo</label><input type="text" name="endereco" value={formData.endereco} onChange={handleChange} className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1e5aa0] outline-none" placeholder="Rua, Número, Bairro, Cidade - UF" /></div>
          </div>
          <div className="pt-6 border-t border-slate-100 flex justify-end"><button type="submit" disabled={isSaving} className="bg-[#1e5aa0] text-white px-6 py-3 rounded-lg font-bold hover:bg-[#154278] transition-colors shadow-md disabled:opacity-50">{isSaving ? 'Salvando...' : 'Salvar Alterações'}</button></div>
        </form>
      </div>
    </div>
  );
}

// --- VISÃO: DASHBOARD ---
function DashboardView({ projects, checklists }) {
  const totalValue = projects.reduce((sum, p) => sum + Number(p.valorTotal), 0);
  const activeProjects = projects.filter(p => p.status === 'EM ANDAMENTO').length;
  
  let received = 0, pending = 0;
  projects.forEach(p => { (p.parcelas || []).forEach(parc => { if (parc.paga) received += Number(parc.valor); else pending += Number(parc.valor); }); });

  const limitDate = new Date(); limitDate.setDate(limitDate.getDate() + 3);
  const upcomingChecklists = checklists.filter(c => {
    if (c.concluido || !c.dataPrevista) return false;
    const [y, m, d] = c.dataPrevista.split('-');
    return new Date(y, m - 1, d) <= limitDate; 
  }).sort((a,b) => new Date(a.dataPrevista) - new Date(b.dataPrevista));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <StatCard title="Total em Contratos" value={formatCurrency(totalValue)} icon={<Wallet className="text-blue-500" />} color="blue" />
        <StatCard title="Total Recebido" value={formatCurrency(received)} icon={<TrendingUp className="text-emerald-500" />} color="emerald" />
        <StatCard title="A Receber" value={formatCurrency(pending)} icon={<CalendarDays className="text-amber-500" />} color="amber" />
        <StatCard title="Projetos Ativos" value={activeProjects} icon={<FolderKanban className="text-indigo-500" />} color="indigo" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col max-h-[400px]">
          <h3 className="text-base sm:text-lg font-black text-slate-800 mb-4 border-b pb-2 flex items-center justify-between uppercase"><span>Evolução Projetos</span><span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">{projects.length} Lançados</span></h3>
          <div className="overflow-y-auto pr-2 space-y-4 flex-1">
            {projects.map(p => {
              const currentFaseIndex = FASES_ANALITICAS.indexOf(p.faseAnalitica || 'LEVANTAMENTO');
              const percent = Math.round(((currentFaseIndex + 1) / FASES_ANALITICAS.length) * 100);
              return (
                <div key={p.id} className="border border-slate-100 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                  <div className="flex justify-between items-center mb-2"><p className="font-bold text-slate-800 text-sm truncate pr-2 uppercase">{p.nomeProjeto || p.clientName}</p><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${p.status === 'EM ANDAMENTO' ? 'bg-blue-100 text-blue-700' : p.status === 'ENTREGUE' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{p.status}</span></div>
                  <div className="flex justify-between text-xs mb-1 font-bold"><span className="text-slate-500">{p.faseAnalitica || 'LEVANTAMENTO'}</span><span className="text-[#1e5aa0]">{percent}%</span></div>
                  <div className="w-full bg-slate-200 rounded-full h-1.5"><div className="bg-[#1e5aa0] h-1.5 rounded-full transition-all" style={{ width: `${percent}%` }}></div></div>
                </div>
              );
            })}
            {projects.length === 0 && <p className="text-slate-400 text-sm text-center py-8">Nenhum projeto lançado.</p>}
          </div>
        </div>

        <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col max-h-[400px]">
          <h3 className="text-base sm:text-lg font-black text-slate-800 mb-4 border-b pb-2 flex items-center justify-between uppercase"><span>Tarefas Pendentes</span><span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-1 rounded-full">Próx. 3 Dias</span></h3>
          <div className="overflow-y-auto pr-2 space-y-3 flex-1">
            {upcomingChecklists.map(chk => {
              const p = projects.find(proj => proj.id === chk.projectId);
              const isLate = new Date(chk.dataPrevista) < new Date(getToday());
              return (
                <div key={chk.id} className="flex items-start space-x-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${isLate ? 'bg-red-500' : 'bg-amber-400'}`}></div>
                  <div className="flex-1 min-w-0"><p className="text-sm font-bold text-slate-700 leading-tight">{chk.descricao}</p><p className="text-[10px] sm:text-xs text-slate-500 truncate mt-1 font-bold uppercase">{p ? (p.nomeProjeto || p.clientName) : 'Projeto Excluído'}</p></div>
                  <div className={`text-xs font-black shrink-0 ${isLate ? 'text-red-600' : 'text-slate-500'}`}>{formatDate(chk.dataPrevista).substring(0, 5)}</div>
                </div>
              );
            })}
            {upcomingChecklists.length === 0 && <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2 py-8"><CheckCircle2 size={32} className="text-emerald-400 opacity-50" /><p className="text-sm font-bold">Tudo em dia para os próximos dias!</p></div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color }) {
  const bgColors = { blue: 'bg-blue-50', emerald: 'bg-emerald-50', amber: 'bg-amber-50', indigo: 'bg-indigo-50' };
  return (
    <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center space-x-3 sm:space-x-4">
      <div className={`p-3 sm:p-4 rounded-xl ${bgColors[color]} shrink-0`}>{icon}</div>
      <div className="flex-1 min-w-0"><p className="text-[10px] sm:text-[11px] font-black text-slate-500 uppercase tracking-widest truncate">{title}</p><p className="text-lg lg:text-xl font-black text-slate-800 truncate mt-0.5" title={value}>{value}</p></div>
    </div>
  );
}

// --- VISÃO: CLIENTES ---
function ClientsView({ workspaceId, clients, projects, onOpenProject, appUser }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [alertDialog, setAlertDialog] = useState(null);
  const [clientProjectsModal, setClientProjectsModal] = useState(null);

  const canEdit = appUser.role === 'gestor' || appUser.permissions?.edit;
  const canDelete = appUser.role === 'gestor' || appUser.permissions?.delete;
  const canCreate = appUser.role === 'gestor' || appUser.permissions?.create;

  const handleDelete = (client) => {
    if (projects.some(p => p.clientId === client.id)) return setAlertDialog({ title: 'Atenção', message: 'Há projetos lançados para esse cliente. Não é possível excluí-lo.' });
    setConfirmDialog({ title: 'Excluir Cliente', message: 'Deseja realmente excluir o cadastro do cliente?', onConfirm: async () => { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clients', client.id)); setConfirmDialog(null); } });
  };

  return (
    <div className="h-full flex flex-col pt-2">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
        <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight border-b-4 border-[#1e5aa0] pb-1">Meus Clientes</h3>
        {canCreate && <button onClick={() => { setEditingClient(null); setIsModalOpen(true); }} className="bg-[#1e5aa0] hover:bg-[#154278] text-white px-4 py-2.5 rounded-lg font-bold flex items-center justify-center space-x-2 transition-colors shadow-sm w-full sm:w-auto"><Plus size={18} /><span>Novo Cliente</span></button>}
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 flex flex-col overflow-hidden">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead><tr className="bg-[#5a82b5] text-white text-[10px] uppercase tracking-widest sticky top-0 z-10 shadow-sm"><th className="p-4 font-bold">Nome</th><th className="p-4 font-bold">Contato</th><th className="p-4 font-bold text-center">Projetos</th><th className="p-4 font-bold text-center">Ações</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {clients.map(client => (
                <tr key={client.id} className="hover:bg-slate-50 transition-colors text-sm text-slate-700">
                  <td className="p-4 font-bold text-slate-800 uppercase">{client.nome}</td>
                  <td className="p-4"><p className="font-bold">{client.telefone}</p><p className="text-xs text-slate-400">{client.email}</p></td>
                  <td className="p-4 text-center"><button onClick={() => setClientProjectsModal(client)} className="bg-slate-100 hover:bg-slate-200 text-[#1e5aa0] font-bold py-1.5 px-3 rounded-lg text-[10px] uppercase tracking-wide transition-colors border border-slate-200">{projects.filter(p => p.clientId === client.id).length} Projetos</button></td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center space-x-3">
                      {canEdit && <button onClick={() => {setEditingClient(client); setIsModalOpen(true);}} className="text-[#5a82b5] hover:text-[#1e5aa0]"><Edit size={16} /></button>}
                      {canDelete && <button onClick={() => handleDelete(client)} className="text-red-500 hover:text-red-700"><Trash2 size={16} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
              {clients.length === 0 && <tr><td colSpan="4" className="p-8 text-center text-slate-400 font-medium">Nenhum cliente cadastrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {isModalOpen && <ClientModal workspaceId={workspaceId} client={editingClient} onClose={() => setIsModalOpen(false)} />}
      {confirmDialog && <ConfirmModal title={confirmDialog.title} message={confirmDialog.message} onConfirm={confirmDialog.onConfirm} onCancel={() => setConfirmDialog(null)} />}
      {alertDialog && <AlertModal title={alertDialog.title} message={alertDialog.message} onClose={() => setAlertDialog(null)} />}
      {clientProjectsModal && <ClientProjectsModal client={clientProjectsModal} projects={projects.filter(p => p.clientId === clientProjectsModal.id)} onClose={() => setClientProjectsModal(null)} onOpenProject={onOpenProject} />}
    </div>
  );
}

function ClientProjectsModal({ client, projects, onClose, onOpenProject }) {
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[80vh]">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-[#1e5aa0] text-white rounded-t-2xl"><h2 className="text-lg font-bold uppercase tracking-wide">Projetos: {client.nome}</h2><button onClick={onClose}><X size={24} /></button></div>
        <div className="p-4 overflow-y-auto flex-1 bg-slate-50">
          {projects.length > 0 ? (
            <div className="space-y-3">
              {projects.map(p => (
                <div key={p.id} className="border border-slate-200 rounded-xl p-4 shadow-sm bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div><h4 className="font-bold text-slate-800 uppercase">{p.nomeProjeto || 'PROJETO SEM NOME'}</h4><p className="text-xs text-slate-500 font-bold mt-1 flex gap-2 items-center"><span className="bg-blue-50 text-blue-700 border px-2 py-0.5 rounded">{p.status}</span><span>{formatCurrency(p.valorTotal)}</span></p></div>
                  <button onClick={() => { onClose(); onOpenProject(p); }} className="bg-slate-100 hover:bg-slate-200 text-[#1e5aa0] px-4 py-2 rounded-lg font-bold text-xs uppercase transition-colors border">Ver Detalhes</button>
                </div>
              ))}
            </div>
          ) : <p className="text-center text-slate-400 py-8 font-medium">Nenhum projeto encontrado.</p>}
        </div>
      </div>
    </div>
  );
}

function ClientModal({ workspaceId, client, onClose }) {
  const [formData, setFormData] = useState(client || { 
    nome: '', telefone: '', email: '', cpf: '', rg: '', 
    cep: '', rua: '', numero: '', bairro: '', cidade: '', estado: '' 
  });
  const [alertMsg, setAlertMsg] = useState('');

  const buscarCEP = async (valorCep) => {
    const raw = valorCep.replace(/\D/g, '');
    if (raw.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${raw}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setFormData(prev => ({ ...prev, rua: data.logradouro || '', bairro: data.bairro || '', cidade: data.localidade || '', estado: data.uf || '' }));
      }
    } catch (err) { console.error("Erro viaCep", err); }
  };

  const handleChange = (e) => {
    let { name, value } = e.target;
    if (name === 'telefone') value = maskPhone(value);
    if (name === 'cpf') value = maskCPF(value);
    if (name === 'cep') value = maskCEP(value);
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.nome) return;
    
    // Validações Manuais
    if (formData.email && !isValidEmail(formData.email)) return setAlertMsg("Por favor, informe um e-mail válido.");
    if (formData.cpf && formData.cpf.replace(/\D/g, '').length !== 11) return setAlertMsg("O CPF deve conter 11 dígitos numéricos.");

    try {
      if (client) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clients', client.id), formData);
      else await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'clients'), { ...formData, workspaceId });
      onClose();
    } catch (error) { console.error(error); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-[#1e5aa0] text-white rounded-t-2xl"><h2 className="text-lg font-bold uppercase tracking-wide">{client ? 'Editar' : 'Cadastrar'} Cliente</h2><button onClick={onClose}><X size={20} /></button></div>
        
        <form id="cform" onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Dados Pessoais */}
          <div>
            <h3 className="text-xs font-black text-[#1e5aa0] uppercase border-b pb-1 mb-3">Dados Pessoais</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2"><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nome Completo *</label><input required type="text" name="nome" value={formData.nome} onChange={handleChange} className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-[#1e5aa0] outline-none font-bold text-slate-800" /></div>
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Telefone (Fixo ou Celular)</label><input type="text" name="telefone" placeholder="(00) 00000-0000" value={formData.telefone} onChange={handleChange} className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-[#1e5aa0] outline-none font-medium" /></div>
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">E-mail</label><input type="email" name="email" placeholder="nome@dominio.com.br" value={formData.email} onChange={handleChange} className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-[#1e5aa0] outline-none" /></div>
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">CPF (11 dígitos)</label><input type="text" name="cpf" placeholder="000.000.000-00" value={formData.cpf} onChange={handleChange} className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-[#1e5aa0] outline-none" /></div>
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">RG</label><input type="text" name="rg" value={formData.rg} onChange={handleChange} className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-[#1e5aa0] outline-none" /></div>
            </div>
          </div>

          {/* Endereço */}
          <div>
             <h3 className="text-xs font-black text-[#1e5aa0] uppercase border-b pb-1 mb-3">Endereço</h3>
             <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-1"><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">CEP</label><input type="text" name="cep" placeholder="00000-000" value={formData.cep} onChange={handleChange} onBlur={(e) => buscarCEP(e.target.value)} className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-[#1e5aa0] outline-none font-bold" /></div>
                <div className="md:col-span-2"><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Rua / Logradouro</label><input type="text" name="rua" value={formData.rua} onChange={handleChange} className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-[#1e5aa0] outline-none" /></div>
                <div className="md:col-span-1"><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Número</label><input type="text" name="numero" value={formData.numero} onChange={handleChange} className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-[#1e5aa0] outline-none" /></div>
                
                <div className="md:col-span-2"><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Bairro</label><input type="text" name="bairro" value={formData.bairro} onChange={handleChange} className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-[#1e5aa0] outline-none" /></div>
                <div className="md:col-span-1"><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Cidade</label><input type="text" name="cidade" value={formData.cidade} onChange={handleChange} className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-[#1e5aa0] outline-none" /></div>
                <div className="md:col-span-1"><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Estado</label>
                  <select name="estado" value={formData.estado} onChange={handleChange} className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-[#1e5aa0] outline-none bg-white">
                    <option value=""></option>
                    {ESTADOS_BR.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </div>
             </div>
          </div>
        </form>

        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end space-x-3 rounded-b-2xl">
          <button onClick={onClose} type="button" className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-200 rounded-lg">Cancelar</button>
          <button form="cform" type="submit" className="px-5 py-2.5 bg-[#1e5aa0] text-white font-bold hover:bg-[#154278] rounded-lg shadow-sm">Salvar Cliente</button>
        </div>
      </div>
      {alertMsg && <AlertModal title="Atenção" message={alertMsg} onClose={() => setAlertMsg('')} />}
    </div>
  );
}

// --- VISÃO: PROJETOS E DOCUMENTOS ---
function ProjetosView({ workspaceId, projects, clients, companyUsers, targetProject, clearTargetProject, appUser }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [docsModalProject, setDocsModalProject] = useState(null);
  const [filterClient, setFilterClient] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [alertDialog, setAlertDialog] = useState(null);

  const canEdit = appUser.role === 'gestor' || appUser.permissions?.edit;
  const canDelete = appUser.role === 'gestor' || appUser.permissions?.delete;
  const canCreate = appUser.role === 'gestor' || appUser.permissions?.create;

  useEffect(() => { if (targetProject) { setEditingProject(targetProject); setIsModalOpen(true); clearTargetProject(); } }, [targetProject]);

  const filteredProjects = useMemo(() => projects.filter(p => {
    const searchLower = filterClient.toLowerCase();
    const matchClient = p.clientName.toLowerCase().includes(searchLower) || (p.nomeProjeto && p.nomeProjeto.toLowerCase().includes(searchLower)) || (p.responsavelNome && p.responsavelNome.toLowerCase().includes(searchLower));
    return matchClient && (filterStatus ? p.status === filterStatus : true);
  }), [projects, filterClient, filterStatus]);

  const handleDelete = (project) => {
    if (project.parcelas?.some(p => p.paga)) return setAlertDialog({ title: 'Ação Bloqueada', message: 'Já existem baixas realizadas para esse projeto. Não é possível excluí-lo.' });
    setConfirmDialog({ title: 'Excluir Projeto', message: 'Deseja realmente excluir o projeto?', onConfirm: async () => { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', project.id)); setConfirmDialog(null); } });
  };

  return (
    <div className="h-full flex flex-col space-y-4 pt-2">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight border-b-4 border-[#1e5aa0] pb-1">Gestão de Projetos</h3>
        {canCreate && <button onClick={() => { setEditingProject(null); setIsModalOpen(true); }} className="bg-[#1e5aa0] hover:bg-[#154278] text-white px-4 py-2.5 rounded-lg font-bold flex items-center justify-center space-x-2 transition-colors shadow-sm w-full md:w-auto"><Plus size={18} /><span>Lançar Projeto</span></button>}
      </div>
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-widest">Buscar (Projeto/Cliente/Resp)</label><input type="text" value={filterClient} onChange={(e) => setFilterClient(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1e5aa0] outline-none text-sm font-medium"/></div>
        <div><label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-widest">Status</label><select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1e5aa0] outline-none text-sm bg-white font-bold text-slate-700"><option value="">TODOS</option><option value="EM ANDAMENTO">EM ANDAMENTO</option><option value="ENTREGUE">ENTREGUE</option><option value="CANCELADO">CANCELADO</option></select></div>
      </div>
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse min-w-[850px]">
            <thead><tr className="bg-[#5a82b5] text-white text-[10px] uppercase tracking-widest sticky top-0 z-10"><th className="p-4 font-bold w-1/3">Projeto / Cliente</th><th className="p-4 font-bold text-center w-1/6">Status</th><th className="p-4 font-bold text-center">Data Fech.</th><th className="p-4 font-bold text-center">Docs</th><th className="p-4 font-bold text-right">Valor Total</th><th className="p-4 font-bold text-center">Ações</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProjects.map(p => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors text-sm text-slate-700">
                  <td className="p-4">
                    <div className="font-black uppercase text-xs text-slate-800 truncate">{p.nomeProjeto || 'SEM NOME'}</div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">{p.clientName}</div>
                    {p.responsavelNome && <div className="text-[9px] font-bold text-[#1e5aa0] uppercase mt-1 bg-blue-50 border border-blue-100 inline-block px-1.5 py-0.5 rounded">Resp: {p.responsavelNome}</div>}
                  </td>
                  <td className="p-4 text-center"><span className={`text-[9px] px-2.5 py-1 rounded-full font-black uppercase tracking-widest border ${p.status==='EM ANDAMENTO'?'bg-blue-50 text-blue-700 border-blue-200':p.status==='ENTREGUE'?'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-red-50 text-red-700 border-red-200'}`}>{p.status}</span></td>
                  <td className="p-4 text-center font-bold text-xs">{formatDate(p.dataFechamento)}</td>
                  <td className="p-4 text-center"><button onClick={() => setDocsModalProject(p)} className="bg-slate-100 text-slate-600 border border-slate-200 hover:border-[#1e5aa0] hover:text-[#1e5aa0] p-1.5 rounded-lg flex items-center justify-center space-x-1 mx-auto transition-colors"><FolderOpen size={16} /> <span className="text-[9px] font-black uppercase">Docs</span></button></td>
                  <td className="p-4 text-right font-black text-slate-800">{formatCurrency(p.valorTotal)}</td>
                  <td className="p-4 text-center space-x-3">
                    {canEdit && <button onClick={() => {setEditingProject(p); setIsModalOpen(true);}} className="text-[#5a82b5] hover:text-[#1e5aa0]"><Edit size={16} /></button>}
                    {canDelete && <button onClick={() => handleDelete(p)} className="text-red-500 hover:text-red-700"><Trash2 size={16} /></button>}
                  </td>
                </tr>
              ))}
              {filteredProjects.length === 0 && <tr><td colSpan="6" className="p-8 text-center text-slate-400 font-medium">Nenhum projeto lançado ou permitido para você.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {isModalOpen && <ProjectModal workspaceId={workspaceId} clients={clients} companyUsers={companyUsers} project={editingProject} onClose={() => setIsModalOpen(false)} />}
      {docsModalProject && <DocumentsModal workspaceId={workspaceId} project={docsModalProject} onClose={() => setDocsModalProject(null)} />}
      {confirmDialog && <ConfirmModal title={confirmDialog.title} message={confirmDialog.message} onConfirm={confirmDialog.onConfirm} onCancel={() => setConfirmDialog(null)} />}
      {alertDialog && <AlertModal title={alertDialog.title} message={alertDialog.message} onClose={() => setAlertDialog(null)} />}
    </div>
  );
}

function DocumentsModal({ workspaceId, project, onClose }) {
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [viewingDoc, setViewingDoc] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'documents'), (snap) => {
      setDocuments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(d => d.projectId === project.id && d.workspaceId === workspaceId));
    });
    return () => unsub();
  }, [workspaceId, project]);

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    setUploading(true);
    for (const file of files) {
      if (file.size > 1048000) continue;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'documents'), { workspaceId, projectId: project.id, nome: file.name, tipo: file.type || 'application/octet-stream', tamanho: file.size, dataUpload: new Date().toISOString(), conteudoBase64: ev.target.result });
      };
      reader.readAsDataURL(file);
    }
    setUploading(false);
  };

  const deleteDocu = async (id) => { if(window.confirm('Excluir arquivo?')) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'documents', id)); };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col h-[85vh]">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-[#1e5aa0] text-white rounded-t-2xl shrink-0"><div><h2 className="text-lg font-bold uppercase flex items-center gap-2"><FolderOpen size={20}/> Documentos do Projeto</h2><p className="text-blue-200 text-xs mt-1 font-bold">{project.nomeProjeto || project.clientName}</p></div><button onClick={onClose}><X size={24} /></button></div>
        <div className="bg-slate-50 p-4 border-b border-slate-200 flex shrink-0">
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="bg-white border border-[#1e5aa0] text-[#1e5aa0] px-4 py-2 rounded-lg font-bold flex items-center space-x-2 text-xs uppercase tracking-wide transition-colors shadow-sm hover:bg-blue-50"><Upload size={16} /> <span>{uploading ? 'Enviando...' : 'Fazer Upload'}</span></button>
          <input type="file" multiple ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
        </div>
        <div className="flex-1 overflow-y-auto p-6 bg-slate-100">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {documents.map(d => (
              <div key={d.id} onDoubleClick={() => setViewingDoc(d)} className="bg-white border border-slate-200 rounded-xl p-3 cursor-pointer hover:border-[#1e5aa0] hover:shadow-md transition-all flex flex-col items-center text-center relative group">
                <button onClick={(e)=>{e.stopPropagation(); deleteDocu(d.id);}} className="absolute top-2 right-2 text-red-400 opacity-0 group-hover:opacity-100 hover:text-red-600"><Trash2 size={14}/></button>
                <FileText size={32} className="mb-2 text-slate-300 group-hover:text-[#1e5aa0]" />
                <p className="text-[10px] font-bold text-slate-700 truncate w-full px-1 uppercase" title={d.nome}>{d.nome}</p>
                <p className="text-[9px] text-slate-400 mt-1 font-bold">{(d.tamanho / 1024).toFixed(0)} KB</p>
                {d.uploadedBy && <p className="text-[8px] text-[#1e5aa0] mt-1 font-bold bg-blue-50 px-1 rounded truncate w-full" title={d.uploadedBy}>Por: {d.uploadedBy.split(' ')[0]}</p>}
                {d.checklistDesc && <p className="text-[8px] text-emerald-600 mt-0.5 font-bold bg-emerald-50 px-1 rounded truncate w-full" title={d.checklistDesc}>Ref: {d.checklistDesc}</p>}
              </div>
            ))}
            {documents.length===0 && <div className="col-span-full text-center text-slate-400 font-bold py-12"><FolderOpen size={40} className="mx-auto mb-2 opacity-30"/>Vazio</div>}
          </div>
        </div>
      </div>
      {viewingDoc && (
        <div className="fixed inset-0 bg-black/90 flex flex-col z-[80]">
          <div className="p-4 flex justify-between items-center text-white bg-black/50 shrink-0"><h3 className="font-bold flex items-center gap-2 text-sm uppercase"><Eye size={18}/> {viewingDoc.nome}</h3><button onClick={() => setViewingDoc(null)} className="hover:text-red-400"><X size={24}/></button></div>
          <div className="flex-1 overflow-auto flex items-center justify-center p-4">
            {viewingDoc.tipo.startsWith('image/') ? <img src={viewingDoc.conteudoBase64} alt={viewingDoc.nome} className="max-w-full max-h-full object-contain rounded" /> : viewingDoc.tipo === 'application/pdf' ? <iframe src={viewingDoc.conteudoBase64} className="w-full h-full bg-white rounded"></iframe> : <div className="bg-white p-8 rounded-xl text-center"><FileText size={48} className="mx-auto text-slate-300 mb-2"/><p className="text-slate-800 font-bold text-sm">Preview Indisponível</p></div>}
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectModal({ workspaceId, clients, companyUsers, project, onClose }) {
  const isEditing = !!project;
  const hasPaid = isEditing && project.parcelas?.some(p => p.paga);
  const [formData, setFormData] = useState(project || { 
    clientId: '', responsavelId: '', nomeProjeto: '', dataFechamento: getToday(), formaPagamento: 'A VISTA', valorTotal: '', status: 'EM ANDAMENTO', faseAnalitica: 'LEVANTAMENTO',
    usarEnderecoCliente: false, cep: '', rua: '', numero: '', bairro: '', cidade: '', estado: ''
  });
  
  const paymentOptions = ['A VISTA', ...Array.from({length: 12}, (_, i) => `CARTAO ${i+1}X`), ...Array.from({length: 4}, (_, i) => `BOLETO ${i+1}X`)];
  
  const buscarCEP = async (valorCep) => {
    const raw = valorCep.replace(/\D/g, '');
    if (raw.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${raw}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setFormData(prev => ({ ...prev, rua: data.logradouro || '', bairro: data.bairro || '', cidade: data.localidade || '', estado: data.uf || '' }));
      }
    } catch (err) { console.error("Erro viaCep", err); }
  };

  const handleUseClientAddress = (e) => {
    const checked = e.target.checked;
    setFormData(prev => ({ ...prev, usarEnderecoCliente: checked }));
    if (checked && formData.clientId) {
      const c = clients.find(x => x.id === formData.clientId);
      if (c) setFormData(prev => ({...prev, cep: c.cep||'', rua: c.rua||'', numero: c.numero||'', bairro: c.bairro||'', cidade: c.cidade||'', estado: c.estado||''}));
    }
  };

  const handleClientChange = (e) => {
    const cId = e.target.value;
    const updates = { clientId: cId };
    if (formData.usarEnderecoCliente && cId) {
      const c = clients.find(x => x.id === cId);
      if (c) { updates.cep=c.cep||''; updates.rua=c.rua||''; updates.numero=c.numero||''; updates.bairro=c.bairro||''; updates.cidade=c.cidade||''; updates.estado=c.estado||''; }
    } else if (formData.usarEnderecoCliente && !cId) {
      updates.cep=''; updates.rua=''; updates.numero=''; updates.bairro=''; updates.cidade=''; updates.estado='';
    }
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const client = clients.find(c => c.id === formData.clientId);
    const responsavel = (companyUsers || []).find(u => u.id === formData.responsavelId);
    let novasParcelas = isEditing ? project.parcelas : [];

    if (!hasPaid && (!isEditing || formData.valorTotal !== project.valorTotal || formData.formaPagamento !== project.formaPagamento || formData.dataFechamento !== project.dataFechamento)) {
      const vNum = parseFloat(String(formData.valorTotal).replace(',', '.'));
      let count = formData.formaPagamento.includes('X') ? parseInt(formData.formaPagamento.replace(/\D/g, '')) : 1;
      novasParcelas = Array.from({length: count}).map((_, i) => { const d = new Date(formData.dataFechamento); d.setMinutes(d.getMinutes() + d.getTimezoneOffset()); d.setMonth(d.getMonth() + i); return { id: generateId(), numero: i + 1, valor: vNum / count, dataVencimento: d.toISOString().split('T')[0], paga: false }; });
    }

    const pData = { ...formData, workspaceId, clientName: client?.nome || '', responsavelNome: responsavel?.nome || '', valorTotal: parseFloat(String(formData.valorTotal).replace(',', '.')), parcelas: novasParcelas };
    if (isEditing) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', project.id), pData);
    else await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'projects'), pData);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-[#1e5aa0] text-white rounded-t-2xl"><h2 className="text-lg font-bold uppercase tracking-wide">{isEditing ? 'Editar Projeto' : 'Lançar Projeto'}</h2><button onClick={onClose}><X size={20} /></button></div>
        <form id="pform" onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto">
          {hasPaid && <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg flex items-start space-x-2 text-amber-800 text-xs font-bold"><Info size={16} className="shrink-0" /><p>Projeto possui parcelas pagas. Valor e Forma de Pagamento bloqueados.</p></div>}
          
          {/* Dados Gerais */}
          <div>
            <h3 className="text-xs font-black text-[#1e5aa0] uppercase border-b pb-1 mb-3">Dados Gerais</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2"><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nome do Projeto *</label><input required name="nomeProjeto" value={formData.nomeProjeto} onChange={e=>setFormData({...formData, nomeProjeto: e.target.value})} className="w-full p-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-[#1e5aa0] font-bold text-slate-800" /></div>
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Cliente *</label><select required value={formData.clientId} onChange={handleClientChange} className="w-full p-2.5 border rounded-lg bg-white outline-none focus:ring-2 focus:ring-[#1e5aa0] font-medium text-sm"><option value=""></option>{clients.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Responsável</label><select value={formData.responsavelId || ''} onChange={e=>setFormData({...formData, responsavelId: e.target.value})} className="w-full p-2.5 border rounded-lg bg-white outline-none focus:ring-2 focus:ring-[#1e5aa0] font-medium text-sm"><option value="">Sem responsável</option>{(companyUsers||[]).map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>
            </div>
          </div>

          {/* Endereço do Projeto */}
          <div>
            <div className="flex justify-between items-center border-b pb-1 mb-3">
              <h3 className="text-xs font-black text-[#1e5aa0] uppercase">Endereço da Obra</h3>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-600"><input type="checkbox" checked={formData.usarEnderecoCliente} onChange={handleUseClientAddress} className="w-3.5 h-3.5 accent-[#1e5aa0]"/> Usar endereço do cliente</label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 opacity-100 transition-opacity" style={{opacity: formData.usarEnderecoCliente ? 0.6 : 1, pointerEvents: formData.usarEnderecoCliente ? 'none' : 'auto'}}>
              <div className="md:col-span-1"><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">CEP</label><input type="text" value={formData.cep} onChange={e=>setFormData({...formData, cep: maskCEP(e.target.value)})} onBlur={e=>buscarCEP(e.target.value)} placeholder="00000-000" className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-[#1e5aa0] outline-none font-bold" /></div>
              <div className="md:col-span-2"><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Rua / Logradouro</label><input type="text" value={formData.rua} onChange={e=>setFormData({...formData, rua: e.target.value})} className="w-full p-2.5 border rounded-lg outline-none" /></div>
              <div className="md:col-span-1"><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Número</label><input type="text" value={formData.numero} onChange={e=>setFormData({...formData, numero: e.target.value})} className="w-full p-2.5 border rounded-lg outline-none" /></div>
              <div className="md:col-span-2"><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Bairro</label><input type="text" value={formData.bairro} onChange={e=>setFormData({...formData, bairro: e.target.value})} className="w-full p-2.5 border rounded-lg outline-none" /></div>
              <div className="md:col-span-1"><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Cidade</label><input type="text" value={formData.cidade} onChange={e=>setFormData({...formData, cidade: e.target.value})} className="w-full p-2.5 border rounded-lg outline-none" /></div>
              <div className="md:col-span-1"><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Estado</label>
                <select value={formData.estado} onChange={e=>setFormData({...formData, estado: e.target.value})} className="w-full p-2.5 border rounded-lg outline-none bg-white"><option value=""></option>{ESTADOS_BR.map(uf => <option key={uf} value={uf}>{uf}</option>)}</select>
              </div>
            </div>
          </div>

          {/* Financeiro */}
          <div>
            <h3 className="text-xs font-black text-[#1e5aa0] uppercase border-b pb-1 mb-3">Financeiro e Status</h3>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Fechamento *</label><input required type="date" value={formData.dataFechamento} onChange={e=>setFormData({...formData, dataFechamento: e.target.value})} className="w-full p-2.5 border rounded-lg outline-none text-sm font-medium" /></div>
              {isEditing && <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Status</label><select value={formData.status} onChange={e=>setFormData({...formData, status: e.target.value})} className="w-full p-2.5 border rounded-lg bg-white outline-none text-sm font-black"><option>EM ANDAMENTO</option><option>ENTREGUE</option><option>CANCELADO</option></select></div>}
              <div className={!isEditing ? "col-span-2" : "col-span-2"}><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Valor Contrato (R$) *</label><input required type="number" step="0.01" value={formData.valorTotal} onChange={e=>setFormData({...formData, valorTotal: e.target.value})} disabled={hasPaid} className="w-full p-2.5 border rounded-lg outline-none font-black text-slate-800 focus:ring-2 disabled:bg-slate-100" /></div>
            </div>
            <div className="mt-4"><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Forma de Pagamento *</label><select required value={formData.formaPagamento} onChange={e=>setFormData({...formData, formaPagamento: e.target.value})} disabled={hasPaid} className="w-full p-2.5 border rounded-lg bg-white outline-none font-bold text-sm disabled:bg-slate-100">{paymentOptions.map(o => <option key={o}>{o}</option>)}</select></div>
          </div>
        </form>
        <div className="p-4 border-t bg-slate-50 flex justify-end space-x-2 rounded-b-2xl"><button onClick={onClose} type="button" className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-200 rounded-lg">Cancelar</button><button form="pform" type="submit" disabled={!clients.length} className="px-5 py-2.5 bg-[#1e5aa0] text-white font-bold hover:bg-[#154278] rounded-lg shadow-sm">Confirmar</button></div>
      </div>
    </div>
  );
}

// --- VISÃO: RECEBIMENTOS ---
function RecebimentosView({ workspaceId, projects, appUser }) {
  const [baseDate, setBaseDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const canEdit = appUser.role === 'gestor' || appUser.permissions?.edit;

  return (
    <div className="h-full flex flex-col space-y-2 overflow-hidden pt-2">
      <div className="flex justify-between items-center w-full shrink-0 border-b-4 border-[#1e5aa0] pb-2">
        <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Grade de Recebimentos</h3>
        <div className="flex space-x-2"><button onClick={() => setBaseDate(new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 1))} className="bg-white border p-1.5 rounded-lg hover:bg-slate-50"><ChevronLeft size={20} /></button><button onClick={() => setBaseDate(new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1))} className="bg-white border p-1.5 rounded-lg hover:bg-slate-50"><ChevronRight size={20} /></button></div>
      </div>
      <div className="flex-1 min-h-0 pb-2">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch h-full">
          {[baseDate, new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1)].map(d => <CompactCalendar key={d.toISOString()} currentDate={d} projects={projects} workspaceId={workspaceId} canEdit={canEdit} />)}
        </div>
      </div>
    </div>
  );
}

function CompactCalendar({ currentDate, projects, workspaceId, canEdit }) {
  const [selectedDayObj, setSelectedDayObj] = useState(null); 
  const year = currentDate.getFullYear(), month = currentDate.getMonth(), daysInMonth = new Date(year, month + 1, 0).getDate(), startOffset = new Date(year, month, 1).getDay() || 7;
  const days = Array(startOffset - 1).fill(null).concat(Array.from({length: daysInMonth}, (_, i) => i + 1));
  
  const insts = {}; let mPaid = 0, mPend = 0;
  projects.forEach(p => (p.parcelas||[]).forEach((parc, i) => {
    if (!parc.dataVencimento) return; const [y, m, d] = parc.dataVencimento.split('-');
    if (parseInt(y) === year && parseInt(m) - 1 === month) {
      const dNum = parseInt(d); if(!insts[dNum]) insts[dNum]=[];
      insts[dNum].push({ ...parc, pIndex: i, pId: p.id, proj: p });
      if (parc.paga) mPaid += Number(parc.valor); else mPend += Number(parc.valor);
    }
  }));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden relative">
      <div className="bg-[#5a82b5] text-white p-2 text-center font-black uppercase tracking-widest text-xs shrink-0">{currentDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}</div>
      <div className="grid grid-cols-7 border-b bg-slate-50 shrink-0">{(['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM']).map(d => <div key={d} className="text-center py-1.5 text-[9px] font-black text-slate-500 border-r uppercase">{d}</div>)}</div>
      <div className="grid grid-cols-7 auto-rows-fr bg-white flex-1 min-h-0">
        {days.map((day, idx) => {
          if (!day) return <div key={`e-${idx}`} className="border-r border-b bg-slate-50"></div>;
          const di = insts[day] || []; const has = di.length > 0; const allPaid = has && di.every(x => x.paga);
          
          return (
            <div key={day} onClick={() => has && setSelectedDayObj({ date: new Date(year, month, day), day, items: di })} className={`border-r border-b p-1.5 flex flex-col justify-between overflow-hidden ${!has ? 'bg-white' : allPaid ? 'bg-[#d4edd9] cursor-pointer hover:brightness-95' : 'bg-[#fff3cd] cursor-pointer hover:brightness-95'}`}>
              <div className="flex justify-between items-start shrink-0"><span className="font-bold text-[10px] text-slate-800">{day}</span>{has && <div className={`w-3.5 h-3.5 border rounded flex items-center justify-center ${allPaid ? 'bg-[#73c87f] border-[#73c87f]' : 'bg-white border-[#73c87f]'}`}>{allPaid && <Check size={10} className="text-white font-bold" />}</div>}</div>
              <div className="flex-1 flex flex-col justify-end min-h-0">
                <div className="flex flex-col gap-px overflow-hidden">{di.slice(0,2).map((x, i) => <div key={i} className={`text-[8px] font-bold truncate uppercase ${x.paga?'text-green-800 opacity-60 line-through':'text-slate-800'}`}>{x.proj.clientName.split(' ')[0]}</div>)}</div>
                {has && <div className={`text-right text-[10px] font-black mt-0.5 truncate ${allPaid?'text-green-900':'text-amber-900'}`}>{formatCurrency(di.reduce((s,p)=>s+Number(p.valor),0))}</div>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="bg-slate-50 border-t p-2.5 grid grid-cols-2 gap-2 shrink-0">
        <div className="flex flex-col"><span className="text-[9px] font-bold text-slate-500 uppercase flex items-center gap-1"><Check size={10} className="text-green-600"/> Recebido</span><span className="text-green-700 font-black text-xs truncate">{formatCurrency(mPaid)}</span></div>
        <div className="flex flex-col text-right border-l pl-2"><span className="text-[9px] font-bold text-slate-500 uppercase flex justify-end items-center gap-1">A Receber <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span></span><span className="text-amber-600 font-black text-xs truncate">{formatCurrency(mPend)}</span></div>
      </div>

      {selectedDayObj && (
        <DayReceiptsModal 
          workspaceId={workspaceId} 
          canEdit={canEdit} 
          dateObj={selectedDayObj.date} 
          items={selectedDayObj.items} 
          onClose={() => setSelectedDayObj(null)} 
        />
      )}
    </div>
  );
}

function DayReceiptsModal({ workspaceId, canEdit, dateObj, items, onClose }) {
  const [payingId, setPayingId] = useState(null);
  const [payForm, setPayForm] = useState({ data: getToday(), forma: 'PIX' });

  const processPayment = async (item, isPaying) => {
    if (!canEdit) return;
    try {
      const novasParcelas = item.proj.parcelas.map((x, idx) => {
        if (idx === item.pIndex) {
          return isPaying 
            ? { ...x, paga: true, dataPagamento: payForm.data, formaRecebimento: payForm.forma }
            : { ...x, paga: false, dataPagamento: null, formaRecebimento: null };
        }
        return x;
      });
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', item.pId), { parcelas: novasParcelas });
      setPayingId(null);
    } catch (e) { console.error("Erro ao processar pagamento", e); }
  };

  return (
    <div className="absolute inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex flex-col justify-end sm:justify-center items-center sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full sm:w-[90%] sm:max-w-md h-[80%] sm:h-auto sm:max-h-[90%] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-[#1e5aa0] text-white shrink-0">
          <div>
            <h3 className="font-black uppercase tracking-tight text-lg">Recebimentos</h3>
            <p className="text-blue-200 text-xs font-medium">{dateObj.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-blue-800 rounded-full transition-colors"><X size={20}/></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 bg-slate-50 space-y-4">
          {items.map((item, index) => {
            const isPayingThis = payingId === `${item.pId}-${item.pIndex}`;
            
            return (
              <div key={`${item.pId}-${item.pIndex}`} className={`border rounded-xl shadow-sm overflow-hidden transition-all ${item.paga ? 'border-emerald-200 bg-emerald-50/50' : isPayingThis ? 'border-[#1e5aa0] bg-blue-50/30 ring-2 ring-blue-100' : 'border-slate-200 bg-white'}`}>
                
                <div className="p-4 flex justify-between items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-slate-800 uppercase truncate text-sm">{item.proj.clientName}</p>
                    <p className="text-xs font-bold text-slate-500 truncate mt-0.5">{item.proj.nomeProjeto || 'Projeto Sem Nome'}</p>
                    {item.paga && (
                      <div className="mt-2 text-[10px] font-bold text-emerald-700 bg-emerald-100 inline-block px-2 py-1 rounded">
                        PAGO EM {formatDate(item.dataPagamento)} VIA {item.formaRecebimento}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-black text-lg ${item.paga ? 'text-emerald-600' : 'text-slate-800'}`}>{formatCurrency(item.valor)}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Venc: {formatDate(item.dataVencimento)}</p>
                  </div>
                </div>

                <div className={`px-4 py-3 border-t bg-slate-50/50 flex justify-end ${item.paga ? 'border-emerald-100' : 'border-slate-100'}`}>
                  {item.paga ? (
                    canEdit && <button onClick={() => processPayment(item, false)} className="text-[10px] font-black text-slate-400 hover:text-red-500 uppercase tracking-widest transition-colors flex items-center gap-1"><X size={12}/> Desfazer Baixa</button>
                  ) : (
                    !isPayingThis && canEdit && (
                      <button onClick={() => { setPayingId(`${item.pId}-${item.pIndex}`); setPayForm({ data: getToday(), forma: 'PIX' }); }} className="bg-[#1e5aa0] hover:bg-[#154278] text-white text-xs font-bold px-4 py-2 rounded-lg shadow-sm transition-colors flex items-center gap-2">
                        <CheckCircle2 size={14} /> Registrar Recebimento
                      </button>
                    )
                  )}
                </div>

                {isPayingThis && (
                  <div className="p-4 border-t border-slate-200 bg-white animate-in slide-in-from-top-2">
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Data Real do Pagamento</label>
                        <input type="date" value={payForm.data} onChange={e => setPayForm({...payForm, data: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 text-sm font-bold text-[#1e5aa0] outline-none focus:ring-2 focus:ring-[#1e5aa0]" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Forma</label>
                        <select value={payForm.forma} onChange={e => setPayForm({...payForm, forma: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2 text-sm font-bold text-slate-700 bg-white outline-none focus:ring-2 focus:ring-[#1e5aa0]">
                          {FORMAS_RECEBIMENTO.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setPayingId(null)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                      <button onClick={() => processPayment(item, true)} className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors flex items-center gap-2"><CreditCard size={14}/> Confirmar Baixa</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          
          {items.length === 0 && (
            <div className="text-center py-8 text-slate-400">
              <CalendarDays size={32} className="mx-auto mb-2 opacity-50"/>
              <p className="font-bold text-sm">Nenhum recebimento neste dia.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- VISÃO: TAREFAS E EVOLUÇÃO ---
function ChecklistView({ workspaceId, projects, checklists, companyUsers, appUser }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [manageModalData, setManageModalData] = useState(null); 
  const [searchTerm, setSearchTerm] = useState('');
  
  const canEdit = appUser.role === 'gestor' || appUser.permissions?.edit;
  const canDelete = appUser.role === 'gestor' || appUser.permissions?.delete;
  const canCreate = appUser.role === 'gestor' || appUser.permissions?.create;

  const toggleChk = async (c) => { 
    if(canEdit) {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'checklists', c.id), { 
        concluido: !c.concluido, 
        dataConclusao: !c.concluido ? getToday() : null 
      }); 
    }
  };
  
  const delChk = async (id) => { if(canDelete && window.confirm('Excluir tarefa?')) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'checklists', id)); };

  const fProjs = projects.filter(p => p.clientName.toLowerCase().includes(searchTerm.toLowerCase()));
  const visibleChecklists = checklists.filter(c => appUser.role === 'gestor' || !c.responsavelId || c.responsavelId === appUser.id);

  return (
    <div className="h-full flex flex-col space-y-4 pt-2">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b-4 border-[#1e5aa0] pb-2">
        <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Tarefas & Evolução</h3>
        {canCreate && <button onClick={() => setIsModalOpen(true)} className="bg-[#1e5aa0] text-white px-4 py-2.5 rounded-lg font-bold flex items-center gap-2 hover:bg-[#154278] shadow-sm"><ListTodo size={18} /><span>Nova Tarefa</span></button>}
      </div>
      <div><input type="text" placeholder="Buscar projeto..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-[#1e5aa0] outline-none text-sm font-medium" /></div>
      
      <div className="flex-1 overflow-y-auto space-y-6 pb-6">
        {fProjs.map(p => {
          const chks = visibleChecklists.filter(c => c.projectId === p.id).sort((a, b) => {
            if (a.solicitaOrcamento && !b.solicitaOrcamento) return -1;
            if (!a.solicitaOrcamento && b.solicitaOrcamento) return 1;
            return new Date(a.dataPrevista) - new Date(b.dataPrevista);
          });

          if (chks.length === 0 && appUser.role !== 'gestor') return null; 
          const idx = FASES_ANALITICAS.indexOf(p.faseAnalitica || 'LEVANTAMENTO');

          return (
            <div key={p.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 p-4 border-b flex justify-between items-center"><div><h4 className="font-black text-slate-800 uppercase text-lg">{p.nomeProjeto || 'PROJETO'}</h4><p className="text-xs font-bold text-slate-500 uppercase">{p.clientName}</p></div></div>
              <div className="p-4 border-b overflow-x-auto"><div className="flex justify-between min-w-[600px] relative"><div className="absolute top-3 left-6 right-6 h-1 bg-slate-200"></div>{FASES_ANALITICAS.map((f, i) => <div key={f} onClick={() => canEdit && updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', p.id), { faseAnalitica: f })} className="flex flex-col items-center z-10 w-24 cursor-pointer group"><div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all mb-2 border-2 ${i<=idx?'bg-[#1e5aa0] border-[#1e5aa0] text-white':'bg-white border-slate-300 text-slate-400'} ${i===idx?'ring-4 ring-blue-100':''}`}>{i<=idx?<Check size={14}/>:i+1}</div><span className={`text-[9px] font-black text-center uppercase ${i<=idx?'text-[#1e5aa0]':'text-slate-400'}`}>{f}</span></div>)}</div></div>
              <div>
                {chks.map(c => {
                  const respNome = c.responsavelId ? (companyUsers.find(u => u.id === c.responsavelId)?.nome || 'Desconhecido') : 'Todos (Sem Atribuição)';
                  const orcsAprovados = (c.orcamentos || []).filter(o => o.status === 'APROVADO' || o.status === 'REALIZADO').length;
                  
                  return (
                    <div key={c.id} className="flex justify-between items-start p-4 border-b last:border-0 hover:bg-slate-50 transition-colors">
                      <div className="flex gap-3">
                        <button onClick={()=>toggleChk(c)} className="mt-0.5">{c.concluido?<CheckCircle2 className="text-green-500" size={22}/>:<Circle className="text-slate-300" size={22}/>}</button>
                        <div>
                          <p className={`text-sm font-bold ${c.concluido?'line-through text-slate-400':'text-slate-800'}`}>{c.descricao}</p>
                          <div className="flex flex-wrap gap-2 mt-1.5 items-center">
                            <span className="text-[9px] font-black uppercase bg-slate-100 text-slate-600 px-2 py-0.5 rounded">Resp: {respNome.split(' ')[0]}</span>
                            {c.solicitaOrcamento ? (
                              <span className="text-[9px] font-black uppercase bg-amber-100 text-amber-700 px-2 py-0.5 rounded flex items-center gap-1"><DollarSign size={10}/> {c.orcamentos?.length || 0} Orçamento(s)</span>
                            ) : c.valor ? (
                              <span className="text-[9px] font-black uppercase bg-blue-50 text-blue-700 px-2 py-0.5 rounded flex items-center gap-1"><DollarSign size={10}/> {formatCurrency(c.valor)}</span>
                            ) : null}
                            {orcsAprovados > 0 && <span className="text-[9px] font-black uppercase bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">Aprovado</span>}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                             <p className="text-[10px] font-bold text-slate-400 uppercase">Criação: {formatDate(c.data)}</p>
                             <p className={`text-[10px] font-bold uppercase ${!c.concluido && new Date(c.dataPrevista) < new Date(getToday()) ? 'text-red-500' : 'text-slate-400'}`}>Prev: {formatDate(c.dataPrevista)}</p>
                             {c.concluido && c.dataConclusao && <p className="text-[10px] font-black text-emerald-600 uppercase flex items-center gap-1"><Check size={10}/> Feito: {formatDate(c.dataConclusao)}</p>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setManageModalData({ checklist: c, project: p })} className="bg-white border hover:bg-slate-50 text-[#1e5aa0] px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-colors shadow-sm flex gap-1 items-center"><Settings2 size={14} className="hidden sm:block"/> Detalhes</button>
                        <button onClick={()=>delChk(c.id)} className="text-slate-300 hover:text-red-500 p-1.5"><Trash2 size={16}/></button>
                      </div>
                    </div>
                  );
                })}
                {!chks.length && <div className="p-4 text-center text-slate-400 text-xs font-bold uppercase">Nenhuma Tarefa Disponível</div>}
              </div>
            </div>
          );
        })}
      </div>
      {isModalOpen && <ChecklistModal workspaceId={workspaceId} projects={projects} companyUsers={companyUsers} onClose={() => setIsModalOpen(false)} />}
      {manageModalData && <ChecklistManageModal workspaceId={workspaceId} appUser={appUser} project={manageModalData.project} checklist={manageModalData.checklist} onClose={() => setManageModalData(null)} />}
    </div>
  );
}

function ChecklistModal({ workspaceId, projects, companyUsers, onClose }) {
  const [f, setF] = useState({ projectId: '', responsavelId: '', data: getToday(), dataPrevista: getToday(), descricao: '', solicitaOrcamento: false, valor: '' });
  
  const save = async (e) => { 
    e.preventDefault(); 
    const payload = { ...f, workspaceId, concluido: false, orcamentos: [], dataConclusao: null };
    if (!f.solicitaOrcamento) payload.valor = f.valor ? parseFloat(String(f.valor).replace(',', '.')) : 0;
    else payload.valor = 0;

    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'checklists'), payload); 
    onClose(); 
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-[60] backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 bg-[#1e5aa0] text-white flex justify-between items-center rounded-t-2xl shrink-0"><h2 className="font-bold uppercase tracking-wide">Nova Tarefa</h2><button onClick={onClose}><X size={20}/></button></div>
        <form onSubmit={save} className="p-6 space-y-4 overflow-y-auto">
          <div><label className="text-xs font-bold text-slate-500 uppercase block mb-1">Projeto *</label><select required value={f.projectId} onChange={e=>setF({...f, projectId:e.target.value})} className="w-full p-2.5 border rounded-lg outline-none font-bold text-sm bg-white"><option></option>{projects.map(p=><option key={p.id} value={p.id}>{p.nomeProjeto} - {p.clientName}</option>)}</select></div>
          <div><label className="text-xs font-bold text-slate-500 uppercase block mb-1">Responsável</label><select value={f.responsavelId} onChange={e=>setF({...f, responsavelId:e.target.value})} className="w-full p-2.5 border rounded-lg outline-none font-bold text-sm bg-white"><option value="">Qualquer Pessoa / Sem Atribuição</option>{companyUsers.map(u=><option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs font-bold text-slate-500 uppercase block mb-1">Criação</label><input type="date" required value={f.data} onChange={e=>setF({...f, data:e.target.value})} className="w-full p-2.5 border rounded-lg outline-none font-medium text-sm" /></div>
            <div><label className="text-xs font-bold text-slate-500 uppercase block mb-1">Previsão Entrega *</label><input type="date" required value={f.dataPrevista} onChange={e=>setF({...f, dataPrevista:e.target.value})} className="w-full p-2.5 border rounded-lg outline-none font-bold text-[#1e5aa0] text-sm" /></div>
          </div>
          <div><label className="text-xs font-bold text-slate-500 uppercase block mb-1">Descrição da Tarefa *</label><textarea required value={f.descricao} onChange={e=>setF({...f, descricao:e.target.value})} rows="3" className="w-full p-2.5 border rounded-lg outline-none resize-none font-medium text-sm"></textarea></div>
          
          <div className="bg-slate-50 p-4 border rounded-xl space-y-3">
            <label className="flex items-center gap-2 cursor-pointer font-bold text-sm text-slate-800"><input type="checkbox" checked={f.solicitaOrcamento} onChange={e=>setF({...f, solicitaOrcamento: e.target.checked})} className="w-4 h-4 accent-[#1e5aa0]" /> Exigir Lançamento de Orçamentos</label>
            {!f.solicitaOrcamento && (
              <div className="animate-in fade-in slide-in-from-top-1"><label className="text-xs font-bold text-slate-500 uppercase block mb-1">Valor da Tarefa (Opcional - R$)</label><input type="number" step="0.01" value={f.valor} onChange={e=>setF({...f, valor:e.target.value})} className="w-full p-2.5 border rounded-lg outline-none font-bold text-sm" /></div>
            )}
          </div>
          
          <button className="w-full bg-[#1e5aa0] hover:bg-[#154278] transition-colors text-white font-bold py-3 rounded-lg shadow mt-2">Salvar Tarefa</button>
        </form>
      </div>
    </div>
  );
}

function ChecklistManageModal({ workspaceId, appUser, project, checklist, onClose }) {
  const [activeTab, setActiveTab] = useState(checklist.solicitaOrcamento ? 'ORCAMENTOS' : 'DOCUMENTOS');
  
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  
  const canEdit = appUser.role === 'gestor' || appUser.permissions?.edit;
  const [showOrcForm, setShowOrcForm] = useState(false);
  const [orcForm, setOrcForm] = useState({ categoria: 'Serviço', observacao: '', nomeProfissional: '', dadosProfissional: '', valor: '' });

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'documents'), (snap) => {
      setDocuments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(d => d.checklistId === checklist.id && d.workspaceId === workspaceId));
    });
    return () => unsub();
  }, [workspaceId, checklist.id]);

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    setUploading(true);
    for (const file of files) {
      if (file.size > 1048000) continue;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'documents'), { 
          workspaceId, 
          projectId: project.id, 
          checklistId: checklist.id,
          checklistDesc: checklist.descricao,
          uploadedBy: appUser.nome,
          nome: file.name, 
          tipo: file.type || 'application/octet-stream', 
          tamanho: file.size, 
          dataUpload: new Date().toISOString(), 
          conteudoBase64: ev.target.result 
        });
      };
      reader.readAsDataURL(file);
    }
    setUploading(false);
  };

  const deleteDocu = async (id) => { if(window.confirm('Remover este anexo?')) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'documents', id)); };

  const addOrcamento = async (e) => {
    e.preventDefault();
    const newOrc = { 
      id: generateId(), ...orcForm, valor: parseFloat(String(orcForm.valor).replace(',', '.')), 
      status: 'PENDENTE', dataCriacao: getToday(), criadoPor: appUser.nome 
    };
    const updated = [...(checklist.orcamentos || []), newOrc];
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'checklists', checklist.id), { orcamentos: updated });
    setShowOrcForm(false);
    setOrcForm({ categoria: 'Serviço', observacao: '', nomeProfissional: '', dadosProfissional: '', valor: '' });
  };

  const changeOrcStatus = async (orcId, newStatus) => {
    if (!canEdit) return;
    const updated = (checklist.orcamentos || []).map(o => {
      if (o.id === orcId) {
        if (newStatus === 'APROVADO') return { ...o, status: newStatus, dataAprovacao: getToday(), aprovadoPor: appUser.nome };
        if (newStatus === 'REALIZADO') return { ...o, status: newStatus, dataRealizacao: getToday(), realizadoPor: appUser.nome };
        if (newStatus === 'PENDENTE') return { ...o, status: newStatus, dataAprovacao: null, aprovadoPor: null, dataRealizacao: null, realizadoPor: null };
      }
      return o;
    });
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'checklists', checklist.id), { orcamentos: updated });
  };

  const deleteOrc = async (orcId) => {
    if(window.confirm('Excluir este orçamento?')) {
      const updated = (checklist.orcamentos || []).filter(o => o.id !== orcId);
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'checklists', checklist.id), { orcamentos: updated });
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-[70] animate-in fade-in">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col h-[90vh]">
        <div className="p-5 border-b border-slate-200 flex justify-between items-start bg-[#1e5aa0] text-white rounded-t-2xl shrink-0">
          <div className="pr-4">
            <p className="text-blue-200 text-[10px] font-black uppercase tracking-widest">{project.nomeProjeto || project.clientName}</p>
            <h2 className="text-lg font-bold leading-tight mt-1">{checklist.descricao}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-blue-800 rounded-full transition-colors shrink-0"><X size={20}/></button>
        </div>

        <div className="flex bg-slate-50 border-b border-slate-200 shrink-0 px-4">
          {checklist.solicitaOrcamento && <button onClick={()=>setActiveTab('ORCAMENTOS')} className={`px-4 py-3 text-xs font-black uppercase tracking-wide border-b-2 transition-colors ${activeTab === 'ORCAMENTOS' ? 'border-[#1e5aa0] text-[#1e5aa0]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>Orçamentos ({(checklist.orcamentos||[]).length})</button>}
          <button onClick={()=>setActiveTab('DOCUMENTOS')} className={`px-4 py-3 text-xs font-black uppercase tracking-wide border-b-2 transition-colors ${activeTab === 'DOCUMENTOS' ? 'border-[#1e5aa0] text-[#1e5aa0]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>Documentos Anexos ({documents.length})</button>
        </div>

        {activeTab === 'ORCAMENTOS' && checklist.solicitaOrcamento && (
          <div className="flex-1 overflow-y-auto p-6 bg-slate-100 flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-black text-slate-700 uppercase tracking-tight"><DollarSign size={18} className="inline mr-1"/> Avaliação de Orçamentos</h3>
              {!showOrcForm && canEdit && <button onClick={()=>setShowOrcForm(true)} className="bg-white border hover:bg-slate-50 text-[#1e5aa0] px-3 py-2 rounded-lg text-xs font-bold uppercase transition-colors shadow-sm flex gap-1 items-center"><Plus size={14}/> Cadastrar</button>}
            </div>

            {showOrcForm && (
              <form onSubmit={addOrcamento} className="bg-white p-5 rounded-xl border border-blue-200 shadow-sm mb-6 animate-in slide-in-from-top-2">
                <h4 className="text-xs font-black text-[#1e5aa0] uppercase mb-4 border-b pb-2">Novo Orçamento</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Categoria *</label><select required value={orcForm.categoria} onChange={e=>setOrcForm({...orcForm, categoria: e.target.value})} className="w-full p-2 border rounded-lg outline-none font-bold text-sm bg-white"><option>Serviço</option><option>Produto</option></select></div>
                  <div><label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Valor Final (R$) *</label><input type="number" step="0.01" required value={orcForm.valor} onChange={e=>setOrcForm({...orcForm, valor: e.target.value})} className="w-full p-2 border rounded-lg outline-none font-black text-sm text-[#1e5aa0]" /></div>
                  <div><label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Nome Fornecedor/Profissional *</label><input required type="text" value={orcForm.nomeProfissional} onChange={e=>setOrcForm({...orcForm, nomeProfissional: e.target.value})} className="w-full p-2 border rounded-lg outline-none font-bold text-sm" /></div>
                  <div><label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Contato/Dados Básicos</label><input type="text" value={orcForm.dadosProfissional} onChange={e=>setOrcForm({...orcForm, dadosProfissional: e.target.value})} className="w-full p-2 border rounded-lg outline-none font-medium text-sm" /></div>
                  <div className="sm:col-span-2"><label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Observações do Orçamento</label><textarea required value={orcForm.observacao} onChange={e=>setOrcForm({...orcForm, observacao: e.target.value})} rows="2" className="w-full p-2 border rounded-lg outline-none resize-none font-medium text-sm"></textarea></div>
                </div>
                <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={()=>setShowOrcForm(false)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg">Cancelar</button><button type="submit" className="px-4 py-2 text-xs font-bold text-white bg-[#1e5aa0] hover:bg-[#154278] rounded-lg shadow-sm">Salvar Orçamento</button></div>
              </form>
            )}

            <div className="space-y-4">
              {(checklist.orcamentos || []).map(o => (
                <div key={o.id} className={`bg-white border rounded-xl p-4 shadow-sm relative overflow-hidden transition-colors ${o.status === 'APROVADO' ? 'border-emerald-300 ring-1 ring-emerald-100' : o.status === 'REALIZADO' ? 'border-[#1e5aa0] bg-blue-50/30' : 'border-slate-200'}`}>
                  {canEdit && <button onClick={()=>deleteOrc(o.id)} className="absolute top-3 right-3 text-slate-300 hover:text-red-500"><Trash2 size={16}/></button>}
                  
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4 pr-6">
                    <div>
                      <div className="flex items-center gap-2 mb-1"><span className="text-[9px] font-black uppercase bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{o.categoria}</span><span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${o.status === 'PENDENTE' ? 'bg-amber-100 text-amber-700' : o.status === 'APROVADO' ? 'bg-emerald-100 text-emerald-700' : 'bg-[#1e5aa0] text-white'}`}>{o.status}</span></div>
                      <h4 className="font-black text-slate-800 text-lg uppercase">{o.nomeProfissional}</h4>
                      <p className="text-xs font-bold text-slate-500 mt-0.5">{o.dadosProfissional}</p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className={`text-xl font-black ${o.status === 'PENDENTE' ? 'text-slate-800' : o.status === 'APROVADO' ? 'text-emerald-600' : 'text-[#1e5aa0]'}`}>{formatCurrency(o.valor)}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Lançado por {o.criadoPor?.split(' ')[0]}</p>
                    </div>
                  </div>
                  
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 mb-4 text-xs font-medium text-slate-700">{o.observacao}</div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                    <div className="flex flex-wrap gap-2">
                      {o.dataAprovacao && <div className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-100 uppercase">Aprovado: {formatDate(o.dataAprovacao)} ({o.aprovadoPor?.split(' ')[0]})</div>}
                      {o.dataRealizacao && <div className="text-[9px] font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-100 uppercase">Realizado: {formatDate(o.dataRealizacao)} ({o.realizadoPor?.split(' ')[0]})</div>}
                    </div>

                    {canEdit && (
                      <div className="flex gap-2">
                        {o.status === 'PENDENTE' && <button onClick={()=>changeOrcStatus(o.id, 'APROVADO')} className="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 px-3 py-1.5 rounded text-xs font-bold uppercase transition-colors">Aprovar Orçamento</button>}
                        {o.status === 'APROVADO' && (
                          <>
                            <button onClick={()=>changeOrcStatus(o.id, 'PENDENTE')} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded text-xs font-bold uppercase transition-colors">Desfazer Aprovação</button>
                            <button onClick={()=>changeOrcStatus(o.id, 'REALIZADO')} className="bg-[#1e5aa0] hover:bg-[#154278] text-white px-3 py-1.5 rounded text-xs font-bold uppercase transition-colors flex items-center gap-1"><HardHat size={14}/> Serviço Realizado</button>
                          </>
                        )}
                        {o.status === 'REALIZADO' && <button onClick={()=>changeOrcStatus(o.id, 'APROVADO')} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded text-xs font-bold uppercase transition-colors flex items-center gap-1"><X size={14}/> Desfazer Realização</button>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {(checklist.orcamentos || []).length === 0 && !showOrcForm && (
                <div className="text-center py-10 bg-white border border-dashed rounded-xl"><BriefcaseBusiness size={32} className="mx-auto mb-2 text-slate-300"/><p className="text-sm font-bold text-slate-500">Nenhum orçamento cadastrado para esta tarefa.</p></div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'DOCUMENTOS' && (
          <div className="flex-1 overflow-y-auto p-6 bg-slate-100 flex flex-col">
            <div className="bg-white p-4 border border-blue-200 rounded-xl flex justify-between items-center mb-6 shadow-sm">
              <div><h3 className="font-black text-[#1e5aa0] uppercase text-sm">Anexos da Tarefa</h3><p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">Estes arquivos também aparecerão no cofre do projeto.</p></div>
              <div><button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="bg-[#1e5aa0] text-white px-4 py-2 rounded-lg font-bold flex items-center space-x-2 text-xs uppercase tracking-wide transition-colors shadow-sm hover:bg-[#154278]"><Paperclip size={14} /> <span>{uploading ? 'Enviando...' : 'Anexar Documento'}</span></button><input type="file" multiple ref={fileInputRef} onChange={handleUpload} className="hidden" /></div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {documents.map(d => (
                <div key={d.id} className="bg-white border border-slate-200 rounded-xl p-3 hover:border-[#1e5aa0] hover:shadow-md transition-all flex flex-col items-center text-center relative group">
                  <button onClick={()=>deleteDocu(d.id)} className="absolute top-2 right-2 text-red-400 opacity-0 group-hover:opacity-100 hover:text-red-600"><Trash2 size={14}/></button>
                  <FileText size={32} className="mb-2 text-slate-300 group-hover:text-[#1e5aa0]" />
                  <p className="text-[10px] font-bold text-slate-700 truncate w-full px-1 uppercase" title={d.nome}>{d.nome}</p>
                  <p className="text-[9px] text-slate-400 mt-1 font-bold">{(d.tamanho / 1024).toFixed(0)} KB</p>
                  <p className="text-[8px] text-[#1e5aa0] mt-1 font-bold bg-blue-50 px-1 rounded truncate w-full" title={d.uploadedBy}>Por: {d.uploadedBy.split(' ')[0]}</p>
                </div>
              ))}
              {documents.length===0 && <div className="col-span-full text-center text-slate-400 font-bold py-12 border border-dashed rounded-xl bg-white"><FolderOpen size={32} className="mx-auto mb-2 opacity-30"/><p className="text-sm">Nenhum documento anexado.</p></div>}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// --- MODAIS GERAIS ---
function AlertModal({ title, message, onClose }) {
  return <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]"><div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center"><AlertCircle size={48} className="text-amber-500 mx-auto mb-4" /><h3 className="text-lg font-black text-slate-800 mb-2">{title}</h3><p className="text-slate-600 mb-6 font-medium">{message}</p><button onClick={onClose} className="w-full bg-[#1e5aa0] text-white py-3 rounded-xl font-bold">Entendi</button></div></div>;
}
function ConfirmModal({ title, message, onConfirm, onCancel }) {
  return <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]"><div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center"><Info size={48} className="text-[#1e5aa0] mx-auto mb-4" /><h3 className="text-lg font-black text-slate-800 mb-2">{title}</h3><p className="text-slate-600 mb-6 font-medium">{message}</p><div className="flex gap-3"><button onClick={onCancel} className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl font-bold">Cancelar</button><button onClick={onConfirm} className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold">Confirmar</button></div></div></div>;
}