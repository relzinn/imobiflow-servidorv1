
import React, { useState, useEffect, useRef } from 'react';
import { StrategyWizard } from './components/StrategyWizard';
import { ContactModal } from './components/ContactModal';
import { QRCodeModal } from './components/QRCodeModal';
import { Icons } from './constants';
import { AppSettings, Contact, ContactType, AutomationStage } from './types';
import { generateFollowUpMessage } from './services/geminiService';

const generateId = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random()}`;

const SettingsModal: React.FC<{ isOpen: boolean, onClose: () => void, settings: AppSettings, onSave: (s: AppSettings) => void }> = ({ isOpen, onClose, settings, onSave }) => {
    const [localSettings, setLocalSettings] = useState(settings);
    useEffect(() => { setLocalSettings(settings); }, [settings, isOpen]);
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                <h2 className="text-xl font-bold mb-4">Ajustes Gerais</h2>
                <div className="space-y-4">
                    <div><label className="text-xs font-bold text-gray-500 uppercase">Seu Nome</label><input className="w-full border p-2 rounded" value={localSettings.agentName} onChange={e => setLocalSettings({...localSettings, agentName: e.target.value})} /></div>
                    <div><label className="text-xs font-bold text-gray-500 uppercase">Imobiliária</label><input className="w-full border p-2 rounded" value={localSettings.agencyName} onChange={e => setLocalSettings({...localSettings, agencyName: e.target.value})} /></div>
                    <div><label className="text-xs font-bold text-gray-500 uppercase">Chave API IA (Opcional)</label><input type="password" placeholder="Cole sua chave aqui para IA" className="w-full border p-2 rounded" value={localSettings.apiKey || ''} onChange={e => setLocalSettings({...localSettings, apiKey: e.target.value})} /></div>
                    <div><label className="text-xs font-bold text-gray-500 uppercase">Tom de Voz</label><select className="w-full border p-2 rounded" value={localSettings.messageTone} onChange={e => setLocalSettings({...localSettings, messageTone: e.target.value as any})}><option value="Casual">Casual</option><option value="Formal">Formal</option><option value="Amigável">Amigável</option><option value="Persuasivo">Persuasivo</option><option value="Consultivo">Consultivo</option><option value="Elegante">Elegante</option><option value="Urgente">Urgente</option><option value="Entusiasta">Entusiasta</option></select></div>
                </div>
                <div className="flex justify-end gap-2 mt-6"><button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded">Cancelar</button><button onClick={() => { onSave(localSettings); onClose(); }} className="px-4 py-2 bg-blue-600 text-white rounded font-bold">Salvar</button></div>
            </div>
        </div>
    );
};

const ChatInterface: React.FC<{ contacts: Contact[], settings: AppSettings, onSend: (c: Contact, msg: string) => void }> = ({ contacts, settings, onSend }) => {
    const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
    const [inputMsg, setInputMsg] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const selectedContact = contacts.find(c => c.id === selectedContactId);
    
    // Sort contacts by last reply time
    const sortedContacts = [...contacts].sort((a, b) => (b.lastReplyTimestamp || 0) - (a.lastReplyTimestamp || 0));

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [selectedContact?.chatHistory, selectedContactId]);

    const handleSend = () => {
        if(!selectedContact || !inputMsg.trim()) return;
        onSend(selectedContact, inputMsg);
        setInputMsg('');
    };

    return (
        <div className="flex h-[calc(100vh-140px)] bg-white rounded-xl shadow border overflow-hidden">
            {/* Sidebar Lista */}
            <div className="w-1/3 border-r flex flex-col">
                <div className="p-4 bg-gray-50 font-bold border-b">Conversas Recentes</div>
                <div className="flex-1 overflow-y-auto">
                    {sortedContacts.map(c => (
                        <div key={c.id} onClick={() => setSelectedContactId(c.id)} className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${selectedContactId === c.id ? 'bg-blue-50' : ''}`}>
                            <div className="font-bold flex justify-between">{c.name} {c.hasUnreadReply && <span className="text-xs bg-red-500 text-white px-1 rounded-full">!</span>}</div>
                            <div className="text-xs text-gray-500 truncate">{c.lastReplyContent || "..."}</div>
                        </div>
                    ))}
                </div>
            </div>
            {/* Chat Area */}
            <div className="w-2/3 flex flex-col bg-[#e5ded8]">
                {selectedContact ? (
                    <>
                        <div className="p-3 bg-white border-b flex justify-between items-center shadow-sm">
                            <span className="font-bold">{selectedContact.name} ({selectedContact.type})</span>
                            <span className="text-xs text-gray-500">{selectedContact.phone}</span>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto space-y-3 flex flex-col">
                            {/* Chat normal (não reverso para scrolar pro final) */}
                            {(selectedContact.chatHistory || []).map((msg, idx) => (
                                <div key={idx} className={`max-w-[80%] p-2 rounded-lg text-sm shadow-sm ${msg.role === 'agent' ? 'bg-[#d9fdd3] self-end' : 'bg-white self-start'}`}>
                                    <div>{msg.content}</div>
                                    <div className="text-[10px] text-gray-500 text-right mt-1">{new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                                </div>
                            ))}
                            {(!selectedContact.chatHistory || selectedContact.chatHistory.length === 0) && <div className="text-center text-gray-500 text-sm mt-10">Nenhuma mensagem trocada ainda.</div>}
                            <div ref={messagesEndRef} />
                        </div>
                        <div className="p-3 bg-white border-t flex gap-2">
                            <input 
                                className="flex-1 border rounded-full px-4 py-2 focus:outline-none focus:border-blue-500" 
                                placeholder="Digite uma mensagem..." 
                                value={inputMsg}
                                onChange={e => setInputMsg(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSend()}
                            />
                            <button onClick={handleSend} className="bg-green-600 text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-green-700" title="Enviar Mensagem"><Icons.Message /></button>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-400">Selecione um contato para conversar</div>
                )}
            </div>
        </div>
    );
};

const App: React.FC = () => {
  const [viewState, setViewState] = useState<'loading' | 'wizard' | 'welcome' | 'dashboard'>('loading');
  const [activeTab, setActiveTab] = useState<'contacts' | 'chat'>('contacts'); // Nova aba
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [isQRCodeOpen, setIsQRCodeOpen] = useState(false);
  const [isInboxOpen, setIsInboxOpen] = useState(false);

  const [filterType, setFilterType] = useState<string>('ALL');
  const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
  const [confirmData, setConfirmData] = useState<{show: boolean, msg: string, action: () => void}>({show: false, msg: '', action: () => {}});

  const [serverStatus, setServerStatus] = useState(false);
  const [lastSync, setLastSync] = useState('-');
  const [autoPilotServer, setAutoPilotServer] = useState(false); // Estado do server
  const [genMsg, setGenMsg] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const getServerUrl = () => (localStorage.getItem('imobiflow_server_url') || 'https://ameer-uncondensational-lemuel.ngrok-free.dev').replace(/\/$/, '');
  const getHeaders = () => ({ 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' });

  // Load Settings
  useEffect(() => {
      const load = async () => {
          try {
              const url = getServerUrl();
              const res = await fetch(`${url}/settings`, { headers: getHeaders() });
              if (res.ok) {
                  const data = await res.json();
                  setSettings({...data, serverUrl: url});
                  setAutoPilotServer(!!data.serverAutomationEnabled); // Sincroniza estado inicial
                  setViewState('welcome');
              } else setViewState('wizard');
          } catch (e) { setViewState('wizard'); }
      };
      load();
  }, []);

  const persistSettings = async (newSettings: AppSettings) => {
      setSettings(newSettings);
      if (newSettings.serverUrl) localStorage.setItem('imobiflow_server_url', newSettings.serverUrl);
      try {
          await fetch(`${newSettings.serverUrl}/settings`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(newSettings) });
      } catch (e) { setToast({msg: 'Erro salvar config', type: 'error'}); }
  };

  const toggleAutoPilot = async () => {
      if(!settings) return;
      const newState = !autoPilotServer;
      setAutoPilotServer(newState);
      const newSettings = { ...settings, serverAutomationEnabled: newState };
      await persistSettings(newSettings);
  };

  const fetchContacts = async (url = getServerUrl()) => {
      try {
          const res = await fetch(`${url}/contacts`, { headers: getHeaders() });
          if (res.ok) setContacts(await res.json());
      } catch (e) {}
  };

  const persistContacts = async (newContacts: Contact[]) => {
      setContacts(newContacts);
      if (!settings) return;
      try { await fetch(`${settings.serverUrl}/contacts`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(newContacts) }); } catch (e) {}
  };

  // SYNC LOOP (Atualiza status e mensagens)
  useEffect(() => {
      if(viewState !== 'dashboard' || !settings) return;
      const sync = async () => {
          try {
              const url = settings.serverUrl!;
              const stRes = await fetch(`${url}/status`, { headers: getHeaders() });
              const stData = await stRes.json();
              setServerStatus(stData.isReady);
              setLastSync(new Date().toLocaleTimeString());
              
              // Baixa contatos para atualizar chat e status
              await fetchContacts(url);
          } catch(e) { setServerStatus(false); }
      };
      const i = setInterval(sync, 4000); // Poll a cada 4s para chat ao vivo
      sync();
      return () => clearInterval(i);
  }, [viewState, settings]);

  // Actions
  const handleSaveContact = async (data: Contact) => {
      const newList = contacts.some(c => c.id === data.id) ? contacts.map(c => c.id === data.id ? data : c) : [...contacts, data];
      await persistContacts(newList);
      setEditingContact(null);
      setToast({msg: 'Salvo!', type: 'success'});
  };

  const handleDelete = (id: string) => {
      setConfirmData({
          show: true, msg: 'Excluir contato?',
          action: () => {
              persistContacts(contacts.filter(c => c.id !== id));
              setConfirmData({show: false, msg: '', action: () => {}});
              setToast({msg: 'Excluído.', type: 'success'});
          }
      });
  };

  const sendManual = async (c: Contact, msg: string) => {
      setSending(true);
      try {
          await fetch(`${settings!.serverUrl}/send`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ phone: c.phone, message: msg }) });
          setToast({msg: 'Enviado!', type: 'success'});
          await fetchContacts(); // Atualiza histórico imediato
          setSelectedId(null);
      } catch(e) { setToast({msg: 'Erro envio', type: 'error'}); }
      setSending(false);
  };

  // RENDER
  if (viewState === 'loading') return <div className="min-h-screen flex items-center justify-center bg-gray-100">Carregando...</div>;
  if (viewState === 'wizard') return <StrategyWizard onComplete={async (s) => { await persistSettings(s); setViewState('dashboard'); fetchContacts(s.serverUrl); }} />;
  if (viewState === 'welcome') return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white">
          <h1 className="text-3xl font-bold mb-4">Olá, {settings?.agentName}</h1>
          <button onClick={() => { setViewState('dashboard'); fetchContacts(settings?.serverUrl); }} className="bg-blue-600 px-8 py-3 rounded-xl font-bold hover:bg-blue-500">Entrar no Sistema</button>
          <button onClick={() => setViewState('wizard')} className="mt-4 text-sm text-gray-400 underline">Reconfigurar</button>
      </div>
  );

  const unread = contacts.filter(c => c.hasUnreadReply);
  const filtered = contacts.filter(c => filterType === 'ALL' || c.type === filterType);

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-gray-100 font-sans text-gray-800">
        <aside className="bg-slate-900 text-white w-full md:w-64 p-6 flex flex-col shrink-0">
            <h1 className="text-xl font-bold flex items-center gap-2 mb-8"><span className="bg-blue-600 p-1 rounded"><Icons.Users /></span> ImobiFlow</h1>
            
            {/* Navegação Abas */}
            <nav className="flex flex-col gap-2 mb-6">
                <button onClick={() => setActiveTab('contacts')} className={`text-left px-4 py-2 rounded font-bold transition-colors ${activeTab === 'contacts' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-gray-300'}`}>👥 Contatos</button>
                <button onClick={() => setActiveTab('chat')} className={`text-left px-4 py-2 rounded font-bold transition-colors ${activeTab === 'chat' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-gray-300'}`}>💬 Chat (Ao Vivo)</button>
            </nav>

            <div className="space-y-4">
                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                    <div className="text-xs font-bold text-slate-500 uppercase mb-2">WhatsApp</div>
                    {serverStatus ? <span className="text-emerald-400 text-xs font-bold">● Online</span> : <button onClick={() => setIsQRCodeOpen(true)} className="text-red-400 text-xs font-bold hover:underline" title="Clique para conectar">● Conectar</button>}
                    <div className="text-[10px] text-slate-500 mt-2">Sync: {lastSync}</div>
                </div>
                <div className={`p-4 rounded-xl border transition-colors ${autoPilotServer ? 'bg-indigo-900/40 border-indigo-500' : 'bg-slate-800 border-slate-700'}`}>
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-300 uppercase">Piloto Automático</span>
                        <button onClick={toggleAutoPilot} className={`w-10 h-5 rounded-full relative ${autoPilotServer ? 'bg-indigo-500' : 'bg-slate-600'}`} title="O servidor continuará enviando mesmo com o site fechado"><div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${autoPilotServer ? 'left-6' : 'left-1'}`} /></button>
                    </div>
                    {autoPilotServer && <div className="text-[10px] text-indigo-300 mt-1">Rodando no Servidor 24/7</div>}
                </div>
            </div>
            <div className="mt-auto pt-4"><button onClick={() => setIsSettingsOpen(true)} className="text-sm text-gray-300 hover:text-white flex gap-2 items-center" title="Alterar tom de voz e dados">⚙️ Ajustes Gerais</button></div>
        </aside>

        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
            {activeTab === 'chat' ? (
                <ChatInterface contacts={contacts} settings={settings!} onSend={sendManual} />
            ) : (
                <>
                    <header className="flex justify-between items-center mb-6">
                        <div><h2 className="text-2xl font-bold">Gerenciamento</h2><p className="text-sm text-gray-500">Gestão de leads e automação</p></div>
                        <button onClick={() => { setEditingContact(null); setIsModalOpen(true); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-blue-700 flex items-center gap-2" title="Adicionar novo cliente"><Icons.Plus /> Novo</button>
                    </header>
                    <div className="flex gap-2 mb-4 overflow-x-auto pb-2">{['ALL', ...Object.values(ContactType)].map(t => (<button key={t} onClick={() => setFilterType(t)} className={`px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap ${filterType === t ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`} title={`Filtrar por ${t}`}>{t === 'ALL' ? 'Todos' : t}</button>))}</div>
                    <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 text-xs text-gray-500 uppercase"><tr><th className="p-4 w-12">Auto</th><th className="p-4">Nome</th><th className="p-4">Status</th><th className="p-4 text-right">Ações</th></tr></thead>
                            <tbody className="divide-y divide-gray-100 text-sm">
                                {filtered.map(c => {
                                    const daysWait = c.automationStage !== AutomationStage.IDLE ? Math.floor((Date.now() - new Date(c.lastAutomatedMsgDate || c.lastContactDate).getTime()) / 86400000) : 0;
                                    return (
                                    <React.Fragment key={c.id}>
                                        <tr className={`hover:bg-gray-50 ${c.hasUnreadReply ? 'bg-yellow-50' : ''}`}>
                                            <td className="p-4 text-center"><button onClick={() => handleSaveContact({...c, autoPilotEnabled: !c.autoPilotEnabled})} className={`w-8 h-8 rounded-full flex items-center justify-center ${c.autoPilotEnabled !== false ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`} title={c.autoPilotEnabled !== false ? "Pausar automação para este contato" : "Ativar automação para este contato"}>{c.autoPilotEnabled !== false ? <Icons.Pause /> : <Icons.Play />}</button></td>
                                            <td className="p-4"><div className="font-bold">{c.name}</div><div className="text-xs text-gray-500">{c.type}</div>{c.hasUnreadReply && <div className="text-[10px] font-bold text-yellow-600 mt-1">🔔 Nova Resposta</div>}</td>
                                            <td className="p-4">{c.automationStage === AutomationStage.IDLE ? <span className="px-2 py-1 bg-gray-100 rounded text-xs" title="Aguardando data do próximo ciclo">Pendente</span> : <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs" title="Mensagem enviada, aguardando resposta">Aguardando ({daysWait}d)</span>}</td>
                                            <td className="p-4 text-right flex justify-end gap-2">
                                                <button onClick={() => { setSelectedId(c.id); setGenMsg('Gerando...'); generateFollowUpMessage(c, settings!, false).then(setGenMsg); }} className="p-2 bg-blue-50 text-blue-600 rounded" title="Gerar e enviar mensagem manual agora"><Icons.Message /></button>
                                                <button onClick={() => { setEditingContact(c); setIsModalOpen(true); }} className="p-2 bg-gray-50 text-gray-600 rounded" title="Editar dados do contato"><Icons.Users /></button>
                                                <button onClick={() => handleDelete(c.id)} className="p-2 bg-red-50 text-red-600 rounded" title="Excluir contato permanentemente"><Icons.Trash /></button>
                                            </td>
                                        </tr>
                                        {selectedId === c.id && (<tr className="bg-blue-50/50"><td colSpan={4} className="p-4"><div className="bg-white border rounded p-4 shadow-sm max-w-2xl mx-auto"><textarea className="w-full border rounded p-2 text-sm mb-2" rows={3} value={genMsg} onChange={e => setGenMsg(e.target.value)} /><div className="flex justify-end gap-2"><button onClick={() => setSelectedId(null)} className="px-3 py-1 text-sm bg-gray-200 rounded" title="Cancelar envio">Cancelar</button><button onClick={() => sendManual(c, genMsg)} disabled={sending} className="px-3 py-1 text-sm bg-blue-600 text-white rounded font-bold" title="Enviar mensagem">{sending ? '...' : 'Enviar'}</button></div></div></td></tr>)}
                                    </React.Fragment>
                                );})}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {unread.length > 0 && <button onClick={() => setIsInboxOpen(true)} className="fixed bottom-6 right-6 bg-red-600 text-white p-4 rounded-full shadow-xl animate-bounce z-50 flex items-center justify-center" title="Ver mensagens não lidas"><Icons.Message /><span className="absolute -top-1 -right-1 bg-white text-red-600 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center border border-red-200">{unread.length}</span></button>}
            
            <ContactModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveContact} initialContact={editingContact} settings={settings} />
            <QRCodeModal isOpen={isQRCodeOpen} onClose={() => setIsQRCodeOpen(false)} onConnected={() => { setServerStatus(true); setIsQRCodeOpen(false); }} serverUrl={settings?.serverUrl} onUrlChange={(u) => persistSettings({...settings!, serverUrl: u})} />
            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} settings={settings!} onSave={persistSettings} />
            {isInboxOpen && <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"><div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col"><div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl"><h3 className="font-bold">Notificações ({unread.length})</h3><button onClick={() => setIsInboxOpen(false)} title="Fechar">✕</button></div><div className="p-4 overflow-y-auto space-y-3">{unread.map(c => (<div key={c.id} className="border rounded-lg p-3 bg-yellow-50 border-yellow-200"><div className="font-bold">{c.name}</div><div className="text-sm my-2 italic text-gray-700">{c.lastReplyContent}</div><div className="flex gap-2 mt-2"><button onClick={() => { setIsInboxOpen(false); setActiveTab('chat'); }} className="flex-1 bg-blue-600 text-white py-1 rounded text-xs font-bold" title="Ir para aba de Chat">Abrir Chat</button><button onClick={() => { setIsInboxOpen(false); handleSaveContact({...c, hasUnreadReply: false}); }} className="flex-1 bg-gray-200 text-gray-700 py-1 rounded text-xs font-bold" title="Marcar como lida e atualizar dados">Atualizar</button></div></div>))}</div></div></div>}
            {confirmData.show && <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"><div className="bg-white rounded-lg p-6 shadow-xl max-w-xs w-full text-center"><p className="font-bold mb-4">{confirmData.msg}</p><div className="flex gap-2 justify-center"><button onClick={() => setConfirmData({show: false, msg: '', action: () => {}})} className="px-4 py-2 bg-gray-200 rounded" title="Cancelar ação">Cancelar</button><button onClick={confirmData.action} className="px-4 py-2 bg-red-600 text-white rounded font-bold" title="Confirmar ação">Confirmar</button></div></div></div>}
            {toast && <div className={`fixed top-4 right-4 z-[70] px-4 py-2 rounded shadow-lg text-white font-bold ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>{toast.msg}</div>}
        </main>
    </div>
  );
};

export default App;
