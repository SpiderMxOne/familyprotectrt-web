/**
 * Main Application Logic for FamilyProtect Web
 */

// Global State
let currentState = {
    familyCode: null,
    uid: null,
    currentUser: null,
    members: [],
    messages: [],
    auditLogs: [],
    incidents: [],
    secretKey: null,
    selectedRecipientId: null,
    activeTab: 'chat'
};

// Listeners Registrations
let listeners = {
    members: null,
    messages: null,
    auditLogs: null,
    incidents: null,
    familyGroup: null
};

// Google Maps objects
let map;
let markers = {};
let safePlaceCircles = [];

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initOnboarding();
    checkExistingSession();
    loadGoogleMapsScript(); // Carga dinámica de la API de Maps
});

function loadGoogleMapsScript() {
    if (typeof window.FP_CONFIG === 'undefined' || !window.FP_CONFIG.googleMaps?.apiKey) {
        console.warn("Maps API Key no configurada.");
        return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${window.FP_CONFIG.googleMaps.apiKey}&callback=initMap`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
}

// Función global requerida por Google Maps
window.initMap = function() {
    console.log("Google Maps API cargada.");
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return;

    // Limpiar mensaje de placeholder
    mapContainer.innerHTML = '';

    map = new google.maps.Map(mapContainer, {
        center: { lat: 19.4326, lng: -99.1332 },
        zoom: 12,
        styles: [
            { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
            {
              featureType: "administrative.locality",
              elementType: "labels.text.fill",
              stylers: [{ color: "#d59563" }],
            }
        ]
    });

    // Si ya hay datos cargados, renderizar
    if (currentState.members.length > 0) renderMembersOnMap();
};

function initTabs() {
    const tabs = ['join', 'admin'];
    tabs.forEach(tab => {
        const btn = document.getElementById(`tab-${tab}`);
        if (!btn) return;
        btn.addEventListener('click', () => {
            tabs.forEach(t => {
                document.getElementById(`tab-${t}`).classList.remove('bg-white', 'shadow-sm', 'text-blue-600');
                document.getElementById(`tab-${t}`).classList.add('text-gray-500');
                document.getElementById(`form-${t}`).classList.add('hidden');
            });
            document.getElementById(`tab-${tab}`).classList.add('bg-white', 'shadow-sm', 'text-blue-600');
            document.getElementById(`tab-${tab}`).classList.remove('text-gray-500');
            document.getElementById(`form-${tab}`).classList.remove('hidden');
        });
    });
}

function initOnboarding() {
    // Asegurar que el formulario de unirse sea el visible por defecto
    document.getElementById('form-join').classList.remove('hidden');
    document.getElementById('form-admin').classList.add('hidden');
}

async function checkExistingSession() {
    const savedCode = localStorage.getItem('family_code');
    const savedUid = localStorage.getItem('user_id');

    if (savedCode && savedUid) {
        // Wait for Firebase to check auth state
        auth.onAuthStateChanged(async (user) => {
            if (user && user.uid === savedUid) {
                currentState.familyCode = savedCode;
                currentState.uid = savedUid;
                currentState.secretKey = SecurityUtils.deriveKey(savedCode);
                startApp();
            } else {
                localStorage.clear();
            }
        });
    }
}

// --- Auth Handlers ---

async function handleJoin() {
    const name = document.getElementById('join-name').value.trim();
    const code = document.getElementById('join-code').value.trim().toUpperCase();

    if (!name || !code) return showAuthError("Completa todos los campos");

    showLoading(true);
    const result = await FirebaseManager.loginAnonymously();
    if (result.uid) {
        const uid = result.uid;
        const member = {
            name: name,
            role: 'USER',
            memberType: 'ADULT',
            kinship: 'OTHER',
            isAdmin: false,
            isApproved: false,
            lastSeen: Date.now()
        };
        const success = await FirebaseManager.joinOrCreateFamily(code, member);
        if (success) {
            saveSession(code, uid);
            currentState.familyCode = code;
            currentState.uid = uid;
            currentState.secretKey = SecurityUtils.deriveKey(code);
            startApp();
        } else {
            showAuthError("Código de familia no válido");
        }
    } else {
        showAuthError(`Error: ${result.error || "No se pudo iniciar sesión"}`);
    }
    showLoading(false);
}

async function handleAdminLogin() {
    const email = document.getElementById('admin-email').value.trim();
    const pass = document.getElementById('admin-pass').value.trim();

    if (!email || !pass) return showAuthError("Completa todos los campos");

    showLoading(true);
    const result = await FirebaseManager.authenticateAdmin(email, pass);
    if (result.uid) {
        const uid = result.uid;
        const code = await FirebaseManager.getFamilyCodeByAdmin(email);
        if (code) {
            saveSession(code, uid);
            currentState.familyCode = code;
            currentState.uid = uid;
            currentState.secretKey = SecurityUtils.deriveKey(code);
            startApp();
        } else {
            showAuthError("No se encontró familia asociada");
        }
    } else {
        showAuthError(`Error: ${result.error || "Credenciales incorrectas"}`);
    }
    showLoading(false);
}

async function handleAdminCreate() {
    const email = document.getElementById('admin-email').value.trim();
    const pass = document.getElementById('admin-pass').value.trim();

    if (!email || !pass) return showAuthError("Completa todos los campos");

    showLoading(true);
    const result = await FirebaseManager.createAdminAccount(email, pass);
    if (result.uid) {
        const uid = result.uid;
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        const member = {
            name: email.split('@')[0],
            role: 'ADMIN',
            memberType: 'ADULT',
            kinship: 'PARENT',
            isAdmin: true,
            isApproved: true,
            lastSeen: Date.now()
        };
        const success = await FirebaseManager.joinOrCreateFamily(code, member, email);
        if (success) {
            saveSession(code, uid);
            currentState.familyCode = code;
            currentState.uid = uid;
            currentState.secretKey = SecurityUtils.deriveKey(code);
            startApp();
        } else {
            showAuthError("Error al crear la familia");
        }
    } else {
        showAuthError(`Error: ${result.error || "No se pudo crear cuenta"}`);
    }
    showLoading(false);
}

function handleLogout() {
    localStorage.clear();
    location.reload();
}

// --- App Start & Listeners ---

function startApp() {
    document.getElementById('onboarding').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    document.getElementById('display-family-code').innerText = currentState.familyCode;

    // Start Listeners
    listeners.members = FirebaseManager.listenForMembers(currentState.familyCode, (members) => {
        currentState.members = members;
        currentState.currentUser = members.find(m => m.id === currentState.uid);
        renderMembers();
        updateUIWithUser();
        checkWaitingApproval();
    });

    listeners.messages = FirebaseManager.listenForMessages(currentState.familyCode, (messages) => {
        currentState.messages = messages;
        renderMessages();
    });

    listeners.auditLogs = FirebaseManager.listenForAuditLogs(currentState.familyCode, (logs) => {
        currentState.auditLogs = logs;
        renderAuditLogs();
    });

    listeners.incidents = FirebaseManager.listenForIncidents(currentState.familyCode, (incidents) => {
        currentState.incidents = incidents;
        renderIncidents();
    });

    listeners.familyGroup = FirebaseManager.listenForFamilyGroup(currentState.familyCode, (group) => {
        // Handle family group updates (safe places, etc)
    });

    // Initial render
    switchTab('chat');
}

function checkWaitingApproval() {
    if (currentState.currentUser && !currentState.currentUser.isApproved && !currentState.currentUser.isAdmin) {
        showToast("⚠️ Esperando aprobación del administrador...", "warning");
    }
}

// --- UI Updates ---

function switchTab(tabId) {
    currentState.activeTab = tabId;
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(`tab-content-${tabId}`).classList.remove('hidden');

    document.querySelectorAll('.nav-btn').forEach(btn => {
        if (btn.getAttribute('data-tab') === tabId) btn.classList.add('active');
        else btn.classList.remove('active');
    });
}

function updateUIWithUser() {
    if (!currentState.currentUser) return;
    document.getElementById('user-name').innerText = currentState.currentUser.name;
    document.getElementById('user-role').innerText = currentState.currentUser.isAdmin ? "ADMINISTRADOR" : "MIEMBRO";
    document.querySelector('#user-badge div').innerText = currentState.currentUser.name.charAt(0).toUpperCase();
}

function renderMembers() {
    const chatList = document.getElementById('members-chat-list');
    const familyGrid = document.getElementById('family-grid');
    const mapList = document.getElementById('map-members-list');
    const sosList = document.getElementById('sos-active-list');

    chatList.innerHTML = '';
    familyGrid.innerHTML = '';
    mapList.innerHTML = '';

    let sosCount = 0;
    const activeSOS = [];

    currentState.members.forEach(member => {
        if (member.id === currentState.uid) return;

        // ... (resto de la lógica de renderizado de listas se mantiene igual)
        renderMemberItems(member, chatList, familyGrid, mapList);

        if (member.isSOS) {
            sosCount++;
            activeSOS.push(member);
        }
    });

    renderSOSAlerts(activeSOS);
    renderMembersOnMap(); // NUEVA LLAMADA
}

// Función auxiliar para no duplicar código en el re-render
function renderMemberItems(member, chatList, familyGrid, mapList) {
        // Chat List Item
        const chatItem = `
            <button onclick="selectRecipient('${member.id}')" class="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-all ${currentState.selectedRecipientId === member.id ? 'bg-blue-50 border border-blue-100' : ''}">
                <div class="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-600">${member.name.charAt(0)}</div>
                <div class="text-left flex-1 overflow-hidden">
                    <p class="text-sm font-bold text-gray-800 truncate">${member.name}</p>
                    <p class="text-[10px] text-gray-400 font-bold uppercase">${member.isApproved ? 'En Línea' : 'Pendiente'}</p>
                </div>
            </button>
        `;
        chatList.innerHTML += chatItem;

        // Family Grid Item
        const familyItem = `
            <div class="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm hover:shadow-xl transition-all group">
                <div class="flex items-center gap-4 mb-4">
                    <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-xl font-black text-gray-400 group-hover:from-blue-500 group-hover:to-blue-600 group-hover:text-white transition-all">
                        ${member.name.charAt(0)}
                    </div>
                    <div class="flex-1">
                        <h4 class="font-bold text-gray-900">${member.name}</h4>
                        <span class="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-black tracking-widest uppercase">${member.role}</span>
                    </div>
                    ${currentState.currentUser?.isAdmin ? `
                        <button onclick="handleRevoke('${member.id}')" class="text-gray-300 hover:text-red-500 transition-colors">
                            <i class="fas fa-user-minus"></i>
                        </button>
                    ` : ''}
                </div>
                <div class="grid grid-cols-2 gap-2 mt-6">
                    <div class="bg-gray-50 p-3 rounded-2xl text-center">
                        <p class="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Batería</p>
                        <p class="font-black text-gray-800">${member.batteryLevel || 0}%</p>
                    </div>
                    <div class="bg-gray-50 p-3 rounded-2xl text-center">
                        <p class="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Estado</p>
                        <p class="font-black ${member.isSOS ? 'text-red-500' : (member.isSafeMeetingActive ? 'text-orange-500' : 'text-green-500')}">
                            ${member.isSOS ? 'SOS' : (member.isSafeMeetingActive ? 'CITA' : 'OK')}
                        </p>
                    </div>
                </div>
            </div>
        `;
        familyGrid.innerHTML += familyItem;

        // Map Status Item
        const mapItem = `
            <div class="flex items-center gap-4 cursor-pointer hover:bg-gray-50 p-1 rounded-lg" onclick="focusOnMember('${member.id}')">
                <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-black">${member.name.charAt(0)}</div>
                <div class="flex-1">
                    <p class="text-sm font-bold text-gray-800">${member.name}</p>
                    <p class="text-[10px] text-gray-400 truncate">${member.currentActivity || 'Inactivo'}</p>
                </div>
            </div>
        `;
        mapList.innerHTML += mapItem;
}

function renderMembersOnMap() {
    if (!map) return;

    currentState.members.forEach(member => {
        if (member.latitude && member.longitude) {
            const position = { lat: member.latitude, lng: member.longitude };

            if (markers[member.id]) {
                markers[member.id].setPosition(position);
            } else {
                markers[member.id] = new google.maps.Marker({
                    position: position,
                    map: map,
                    title: member.name,
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 10,
                        fillColor: member.isSOS ? "#FF0000" : "#2563eb",
                        fillOpacity: 1,
                        strokeWeight: 2,
                        strokeColor: "#FFFFFF"
                    }
                });
            }
        }
    });
}

function focusOnMember(id) {
    const member = currentState.members.find(m => m.id === id);
    if (member && member.latitude && member.longitude && map) {
        map.setCenter({ lat: member.latitude, lng: member.longitude });
        map.setZoom(16);
    }
}

function renderMessages() {
    const container = document.getElementById('chat-messages');
    container.innerHTML = '';

    const filtered = currentState.messages.filter(msg => {
        if (!currentState.selectedRecipientId) return !msg.recipientId;
        return (msg.senderId === currentState.uid && msg.recipientId === currentState.selectedRecipientId) ||
               (msg.senderId === currentState.selectedRecipientId && msg.recipientId === currentState.uid);
    }).reverse();

    filtered.forEach(msg => {
        const isMe = msg.senderId === currentState.uid;
        const decrypted = SecurityUtils.decrypt(msg.encryptedContent, currentState.secretKey);

        const bubble = `
            <div class="flex ${isMe ? 'justify-end' : 'justify-start'} animate-slide-up">
                <div class="max-w-[70%] ${isMe ? 'message-me p-4' : 'message-other p-4'}">
                    ${!isMe ? `<p class="text-[10px] font-black uppercase opacity-40 mb-1">${msg.senderName}</p>` : ''}
                    <p class="text-sm leading-relaxed">${decrypted}</p>
                    <p class="text-[9px] font-black uppercase mt-2 opacity-40 text-right">${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                </div>
            </div>
        `;
        container.innerHTML += bubble;
    });
    container.scrollTop = container.scrollHeight;
}

function renderAuditLogs() {
    const container = document.getElementById('audit-logs');
    if (!container) return;
    container.innerHTML = '';
    currentState.auditLogs.forEach(log => {
        const line = `
            <div class="border-l border-blue-500/30 pl-3 py-1">
                <span class="text-blue-500">[${new Date(log.timestamp).toLocaleTimeString()}]</span>
                <span class="text-white font-bold">${log.action}:</span>
                <span class="text-gray-400">${log.detail}</span>
            </div>
        `;
        container.innerHTML += line;
    });
}

function renderIncidents() {
    const container = document.getElementById('incidents-list');
    if (!container) return;

    if (currentState.incidents.length === 0) {
        container.innerHTML = `
            <div class="py-20 text-center border-2 border-dashed border-gray-200 rounded-[50px]">
                <i class="fas fa-folder-open text-4xl text-gray-300 mb-4"></i>
                <p class="text-gray-400 font-bold uppercase tracking-widest">No se han registrado incidentes críticos</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '';
    currentState.incidents.forEach(incident => {
        const member = currentState.members.find(m => m.id === incident.memberId);
        const card = `
            <div class="bg-white p-8 rounded-[40px] shadow-lg border border-gray-100 flex flex-col md:flex-row gap-8 items-center">
                <div class="w-20 h-20 bg-orange-100 text-orange-600 rounded-3xl flex items-center justify-center text-3xl">
                    <i class="fas fa-microchip"></i>
                </div>
                <div class="flex-1 text-center md:text-left">
                    <div class="flex flex-col md:flex-row md:items-center gap-2 mb-2">
                        <span class="text-[10px] font-black bg-orange-500 text-white px-3 py-1 rounded-full uppercase tracking-widest">${incident.incidentType}</span>
                        <span class="text-sm font-bold text-gray-400">${new Date(incident.timestamp).toLocaleString()}</span>
                    </div>
                    <h3 class="text-2xl font-black text-gray-900">Incidente de ${member ? member.name : 'Miembro Desconocido'}</h3>
                    <p class="text-gray-500 mt-2">Detección: <span class="font-bold text-gray-700">${incident.motionAnomaly}</span></p>
                    <div class="mt-4 flex flex-wrap gap-4 justify-center md:justify-start">
                        <div class="flex items-center gap-2 text-xs font-bold text-gray-600">
                            <i class="fas fa-location-dot"></i>
                            <span>${incident.latitude.toFixed(5)}, ${incident.longitude.toFixed(5)}</span>
                        </div>
                        <div class="flex items-center gap-2 text-xs font-bold text-gray-600">
                            <i class="fas fa-mountain"></i>
                            <span>Presión: ${incident.altitudePressure.toFixed(2)} hPa</span>
                        </div>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button onclick="focusOnCoordinates(${incident.latitude}, ${incident.longitude})" class="bg-blue-600 text-white p-4 rounded-2xl hover:bg-blue-700 transition-all">
                        <i class="fas fa-map-marked-alt"></i>
                    </button>
                    <button class="bg-gray-100 text-gray-400 p-4 rounded-2xl cursor-not-allowed">
                        <i class="fas fa-play"></i>
                    </button>
                </div>
            </div>
        `;
        container.innerHTML += card;
    });
}

function focusOnCoordinates(lat, lng) {
    switchTab('map');
    if (map) {
        map.setCenter({ lat: lat, lng: lng });
        map.setZoom(18);
    }
}

function renderSOSAlerts(sosMembers) {
    const container = document.getElementById('sos-active-list');
    if (sosMembers.length === 0) {
        container.innerHTML = `
            <div class="col-span-full py-20 border-2 border-dashed border-gray-800 rounded-[50px]">
                <p class="text-gray-600 font-black uppercase tracking-[0.3em]">No hay emergencias activas</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '';
    sosMembers.forEach(member => {
        const card = `
            <div class="sos-card p-10 rounded-[50px] shadow-2xl relative overflow-hidden group">
                <div class="absolute top-0 right-0 p-8">
                    <div class="animate-ping w-4 h-4 bg-red-500 rounded-full"></div>
                </div>
                <div class="relative z-10 text-left">
                    <p class="text-red-500 font-black text-xs uppercase tracking-widest mb-2">Emergencia en curso</p>
                    <h2 class="text-4xl font-black text-white mb-6 uppercase tracking-tighter">${member.name}</h2>
                    <div class="space-y-4 mb-8">
                        <div class="flex items-center gap-3 text-gray-400">
                            <i class="fas fa-battery-three-quarters"></i>
                            <span class="font-bold">${member.batteryLevel}% de Batería</span>
                        </div>
                        <div class="flex items-center gap-3 text-gray-400">
                            <i class="fas fa-clock"></i>
                            <span class="font-bold">Hace ${Math.floor((Date.now() - member.lastSeen) / 60000)} minutos</span>
                        </div>
                    </div>
                    <div class="flex gap-4">
                        <button onclick="switchTab('map')" class="flex-1 bg-red-600 hover:bg-red-700 text-white font-black py-4 rounded-2xl transition-all">LOCALIZAR</button>
                        ${currentState.currentUser?.isAdmin ? `<button onclick="handleStopSOS('${member.id}')" class="px-6 bg-white/10 hover:bg-white/20 text-white rounded-2xl transition-all"><i class="fas fa-check"></i></button>` : ''}
                    </div>
                </div>
            </div>
        `;
        container.innerHTML += card;
    });

    // Trigger global notification if new SOS
    if (currentState.activeTab !== 'sos') {
        showToast(`🚨 ¡SOS DETECTADO! 🚨`, "danger");
    }
}

// --- Interaction Handlers ---

function selectRecipient(id) {
    currentState.selectedRecipientId = id;
    renderMembers();
    renderMessages();
}

async function handleSendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text || !currentState.secretKey) return;

    const encrypted = SecurityUtils.encrypt(text, currentState.secretKey);
    const message = {
        id: Math.random().toString(36).substring(7),
        senderId: currentState.uid,
        senderName: currentState.currentUser.name,
        recipientId: currentState.selectedRecipientId,
        encryptedContent: encrypted,
        timestamp: Date.now(),
        isRead: false
    };

    await FirebaseManager.sendMessage(currentState.familyCode, message);
    input.value = '';

    // If private chat, notify
    if (currentState.selectedRecipientId) {
        FirebaseManager.addAuditLog(currentState.familyCode, {
            action: "MENSAJE",
            detail: `${currentState.currentUser.name} envió mensaje privado`,
            timestamp: Date.now()
        });
    }
}

async function handleStopSOS(memberId) {
    await FirebaseManager.updateSOSStatus(currentState.familyCode, memberId, false);
    FirebaseManager.addAuditLog(currentState.familyCode, {
        action: "SOS_END",
        detail: `SOS de miembro finalizado por Admin`,
        timestamp: Date.now()
    });
}

async function handleRevoke(memberId) {
    if (!confirm("¿Revocar acceso a este miembro?")) return;
    await familyCollection.doc(currentState.familyCode).collection("members").doc(memberId).delete();
    showToast("Miembro eliminado", "info");
}

// --- Utils ---

function saveSession(code, uid) {
    localStorage.setItem('family_code', code);
    localStorage.setItem('user_id', uid);
}

function showAuthError(msg) {
    const el = document.getElementById('auth-status');
    el.innerText = msg;
    el.classList.remove('hidden');
}

function showLoading(show) {
    const btn = document.querySelector('#form-join button, #form-admin button');
    if (show) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch animate-spin"></i>';
    } else {
        btn.disabled = false;
        btn.innerText = "CONTINUAR";
    }
}

function showToast(msg, type = "info") {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const colors = {
        info: "bg-blue-600",
        warning: "bg-orange-500",
        danger: "bg-red-600"
    };
    toast.className = `${colors[type]} text-white px-6 py-3 rounded-2xl shadow-2xl font-bold animate-slide-up flex items-center gap-3`;
    toast.innerHTML = `<i class="fas fa-bell"></i> <span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function copyFamilyCode() {
    navigator.clipboard.writeText(currentState.familyCode);
    showToast("Código copiado al portapapeles", "info");
}
