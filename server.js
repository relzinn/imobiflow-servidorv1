
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = process.env.PORT || 3001;
const DB_FILE = path.join(__dirname, 'database.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

// CORS Total
app.use(cors({ origin: '*' }));
app.use(express.json());

// --- AUXILIARES ---
function getContacts() {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) { return []; }
}

function saveContacts(contacts) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(contacts, null, 2));
        return true;
    } catch (e) { return false; }
}

function getSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    } catch (e) {}
    return { serverAutomationEnabled: false };
}

function saveSettings(settings) {
    try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2)); } catch (e) {}
}

function formatPhoneForMatch(phone) {
    if (!phone) return '';
    return phone.replace(/\D/g, '').slice(-8); // Compara os ultimos 8 digitos
}

// --- GERAÇÃO DE MENSAGEM (LÓGICA SERVIDOR) ---
async function generateMessage(contact, settings, isNudge) {
    const agentName = settings.agentName || "Seu Corretor";
    const agencyName = settings.agencyName || "Imobiliária";

    // 1. Tenta usar IA se tiver chave
    if (settings.apiKey && settings.apiKey.length > 10) {
        try {
            const ai = new GoogleGenAI({ apiKey: settings.apiKey });
            const prompt = `
                Aja como ${agentName}, corretor da ${agencyName}.
                Escreva msg de WhatsApp para ${contact.name} (${contact.type}).
                Objetivo: ${isNudge ? 'Cobrar resposta suavemente (2ª tentativa)' : 'Retomar contato (Follow-up)'}.
                Contexto Interno (NÃO COPIAR): "${contact.notes || ''}".
                Tom: ${settings.messageTone || 'Casual'}. Curto, sem hashtags.
            `;
            const resp = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
            return resp.text.trim();
        } catch (e) {
            console.error("Erro AI Server:", e.message);
        }
    }

    // 2. Fallback Templates
    if (isNudge) return `Oi ${contact.name}, tudo bem? Sou eu, ${agentName}. Chegou a ver minha mensagem anterior?`;
    
    switch (contact.type) {
        case 'Proprietário':
            return `Olá ${contact.name}, aqui é ${agentName} da ${agencyName}. Como estão as coisas? Gostaria de saber se o imóvel ainda está disponível para venda ou se houve alguma mudança. Abraço!`;
        case 'Construtor':
            return `Olá ${contact.name}, aqui é ${agentName} da ${agencyName}. Tudo bem? Estou atualizando nossa carteira de áreas e lembrei de você. Ainda está buscando novos terrenos na região?`;
        case 'Cliente/Comprador':
        default:
            return `Olá ${contact.name}, aqui é ${agentName} da ${agencyName}. Tudo bem? Passando para saber se continua na busca pelo seu imóvel ou se podemos retomar a pesquisa com novas opções.`;
    }
}

// --- WHATSAPP SETUP ---
let qrCodeData = null;
let clientStatus = 'initializing';
let isReady = false;

const client = new Client({
    authStrategy: new LocalAuth({ clientId: "imobiflow-crm-v3" }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    }
});

client.on('qr', (qr) => {
    console.log('📱 QR Code Novo!');
    qrcodeTerminal.generate(qr, { small: true });
    qrcode.toDataURL(qr, (err, url) => { if (!err) { qrCodeData = url; clientStatus = 'qr_ready'; } });
});

client.on('ready', () => { isReady = true; clientStatus = 'ready'; console.log('✅ WhatsApp Pronto!'); });
client.on('authenticated', () => { clientStatus = 'authenticated'; });
client.on('disconnected', async () => { 
    isReady = false; clientStatus = 'disconnected'; 
    try { await client.destroy(); } catch(e){} 
    setTimeout(() => client.initialize(), 5000); 
});

// ESCUTAR MENSAGENS E GRAVAR NO HISTÓRICO
client.on('message_create', async msg => {
    if(msg.isStatus || msg.from.includes('@g.us') || msg.to.includes('@g.us')) return; // Ignora grupos/status

    const isFromMe = msg.fromMe;
    const contactPhone = isFromMe ? msg.to.replace('@c.us', '') : msg.from.replace('@c.us', '');
    const body = msg.body;

    console.log(`📩 Chat Update (${isFromMe ? 'Enviada' : 'Recebida'}): ${contactPhone}`);

    // Atualizar DB
    const contacts = getContacts();
    const match = formatPhoneForMatch(contactPhone);
    const contactIndex = contacts.findIndex(c => formatPhoneForMatch(c.phone) === match);

    if (contactIndex >= 0) {
        const c = contacts[contactIndex];
        
        if (!c.chatHistory) c.chatHistory = [];
        
        // Evita duplicar mensagens muito recentes
        const isDuplicate = c.chatHistory.some(m => m.content === body && (Date.now() - m.timestamp) < 5000);
        
        if (!isDuplicate) {
            c.chatHistory.push({
                id: msg.id.id,
                role: isFromMe ? 'agent' : 'client',
                content: body,
                timestamp: Date.now()
            });

            // Se for resposta do cliente
            if (!isFromMe) {
                c.hasUnreadReply = true;
                c.lastReplyContent = body;
                c.lastReplyTimestamp = Date.now();
                c.automationStage = 0; // Reseta automação
            }
            
            contacts[contactIndex] = c;
            saveContacts(contacts);
        }
    }
});

// --- AUTOMAÇÃO EM LOOP (SERVER-SIDE) ---
setInterval(async () => {
    if (!isReady) return;
    const settings = getSettings();
    if (!settings.serverAutomationEnabled) return;

    console.log("⚙️ Rodando ciclo de automação...");
    const contacts = getContacts();
    let changed = false;
    const now = Date.now();

    for (let i = 0; i < contacts.length; i++) {
        const c = contacts[i];
        
        if (c.autoPilotEnabled === false || c.hasUnreadReply || c.automationStage === 3) continue;

        let shouldSend = false;
        let isNudge = false;
        
        if (c.automationStage === 0) {
            const lastDate = new Date(c.lastContactDate).getTime();
            const daysSince = (now - lastDate) / (1000 * 60 * 60 * 24);
            if (daysSince >= c.followUpFrequencyDays) shouldSend = true;
        }
        else if (c.automationStage === 1) {
            const lastAuto = new Date(c.lastAutomatedMsgDate).getTime();
            const hoursSince = (now - lastAuto) / (1000 * 60 * 60);
            if (hoursSince >= 24) { shouldSend = true; isNudge = true; }
        }

        if (shouldSend) {
            console.log(`🤖 Enviando auto para ${c.name}...`);
            const text = await generateMessage(c, settings, isNudge);
            
            const chatId = `${c.phone.replace(/\D/g,'')}@c.us`;
            try {
                let finalId = chatId;
                try {
                    const nid = await client.getNumberId(chatId);
                    if(nid) finalId = nid._serialized;
                } catch(e) {}

                await client.sendMessage(finalId, text);

                c.lastContactDate = new Date().toISOString();
                c.lastAutomatedMsgDate = new Date().toISOString();
                c.automationStage = isNudge ? 2 : 1;
                changed = true;
            } catch (e) {
                console.error(`❌ Falha envio auto ${c.name}:`, e.message);
            }
        }
    }

    if (changed) saveContacts(contacts);

}, 60000); // Roda a cada 60 segundos

// --- ENDPOINTS ---
app.get('/status', (req, res) => res.json({ status: clientStatus, isReady }));
app.get('/qr', (req, res) => res.json({ qrCode: qrCodeData }));
app.get('/settings', (req, res) => res.json(getSettings()));
app.post('/settings', (req, res) => { saveSettings(req.body); res.json({success: true}); });
app.get('/contacts', (req, res) => res.json(getContacts()));
app.post('/contacts', (req, res) => { if(saveContacts(req.body)) res.json({success: true}); else res.status(500).json({error: 'Save failed'}); });

// Envio Manual (Chat)
app.post('/send', async (req, res) => {
    if (!isReady) return res.status(503).json({ error: 'Offline' });
    const { phone, message } = req.body;
    try {
        const chatId = `${phone.replace(/\D/g,'')}@c.us`;
        let finalId = chatId;
        try { const nid = await client.getNumberId(chatId); if(nid) finalId = nid._serialized; } catch(e){}
        await client.sendMessage(finalId, message);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

client.initialize();
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server na porta ${PORT}`));
