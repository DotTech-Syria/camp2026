import { db, messaging } from './firebase-config.js';
import { userTeam, userRole, userBadge, currentUser, currentUserName } from './auth.js';
import { collection, query, orderBy, onSnapshot, doc, getDoc, getDocs, where, addDoc, limit, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging.js";

// Theme Logic
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const themeIcon = document.getElementById('theme-icon');

// Check saved theme
const savedTheme = localStorage.getItem('camp-theme') || 'light';
if (savedTheme === 'dark') {
    document.body.setAttribute('data-theme', 'dark');
    if (themeIcon) themeIcon.textContent = 'light_mode';
}

if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.body.getAttribute('data-theme');
        if (currentTheme === 'dark') {
            document.body.removeAttribute('data-theme');
            localStorage.setItem('camp-theme', 'light');
            if (themeIcon) themeIcon.textContent = 'dark_mode';
        } else {
            document.body.setAttribute('data-theme', 'dark');
            localStorage.setItem('camp-theme', 'dark');
            if (themeIcon) themeIcon.textContent = 'light_mode';
        }
    });
}

// Navigation Logic
const navItems = document.querySelectorAll('.nav-item[data-target]');
const navItemsMore = document.querySelectorAll('.nav-item-more[data-target]');
const contentSections = document.querySelectorAll('.content-section');
const btnMoreMenu = document.getElementById('btn-more-menu');
const moreMenuModal = document.getElementById('more-menu-modal');
const btnCloseMore = document.getElementById('btn-close-more');

if (btnMoreMenu && moreMenuModal) {
    btnMoreMenu.addEventListener('click', () => {
        moreMenuModal.classList.remove('hidden');
    });
}
if (btnCloseMore && moreMenuModal) {
    btnCloseMore.addEventListener('click', () => {
        moreMenuModal.classList.add('hidden');
    });
}

const allNavItems = [...navItems, ...navItemsMore];

allNavItems.forEach(item => {
    item.addEventListener('click', () => {
        // Remove active class from all main bottom navs
        navItems.forEach(nav => nav.classList.remove('active'));
        if (btnMoreMenu) btnMoreMenu.classList.remove('active');
        
        contentSections.forEach(section => section.classList.add('hidden'));
        contentSections.forEach(section => section.classList.remove('active'));

        if (item.classList.contains('nav-item-more')) {
            if (btnMoreMenu) btnMoreMenu.classList.add('active');
            if (moreMenuModal) moreMenuModal.classList.add('hidden');
        } else {
            item.classList.add('active');
        }

        const targetId = item.getAttribute('data-target');
        const targetSection = document.getElementById(targetId);
        if (targetSection) {
            targetSection.classList.remove('hidden');
            // Small delay for animation
            setTimeout(() => targetSection.classList.add('active'), 10);
        }
    });
});

// Wait for Auth to be ready
window.addEventListener('authReady', () => {
    fetchUserTeamName();
    listenToSchedule();
    listenToTasks();
    listenToLeaderboard();
    // listenToChat(); // Disabled to reduce database reads
    listenToNotifications();
    listenToTrivia();
    listenToMemories();

    // Request Notification Permission
    if ("Notification" in window) {
        Notification.requestPermission().then((permission) => {
            if (permission === 'granted') {
                // Initialize FCM Token
                getToken(messaging, { vapidKey: 'YOUR_VAPID_KEY_HERE' }).then((currentToken) => {
                    if (currentToken && currentUser) {
                        updateDoc(doc(db, "users", currentUser.uid), { fcmToken: currentToken });
                    }
                }).catch((err) => {
                    console.log('An error occurred while retrieving token. ', err);
                });
            }
        });
        
        try {
            onMessage(messaging, (payload) => {
                new Notification(payload.notification.title, {
                    body: payload.notification.body,
                    icon: './assets/img/logo.png'
                });
            });
        } catch(e) {}
    }
});

// Fetch user's team name
async function fetchUserTeamName() {
    const teamEl = document.getElementById('user-team');

    if (userRole === 'admin') {
        teamEl.textContent = 'إداري';
        teamEl.style.background = 'var(--md-sys-color-primary)';
        teamEl.style.color = 'white';
        return;
    }

    if (!userTeam) {
        teamEl.textContent = 'بدون فرقة';
        return;
    }

    try {
        const teamRef = doc(db, 'teams', userTeam);
        const teamSnap = await getDoc(teamRef);
        if (teamSnap.exists()) {
            teamEl.textContent = teamSnap.data().name;
        }
    } catch (error) {
        console.error("Error fetching team name:", error);
    }
}

// Real-time Listeners
let activeDay = null;
let scheduleUnsubscribe = null;

function listenToSchedule() {
    const displayEl = document.getElementById('active-day-display');
    const scheduleList = document.getElementById('schedule-list');

    // First, listen to which day is active
    onSnapshot(doc(db, "settings", "campState"), (docSnap) => {
        const tasksDisplayEl = document.getElementById('tasks-active-day-display');

        if (docSnap.exists() && docSnap.data().activeDay) {
            activeDay = docSnap.data().activeDay;
            if (displayEl) displayEl.textContent = activeDay;
            if (tasksDisplayEl) tasksDisplayEl.textContent = activeDay;
            fetchScheduleForActiveDay();
            fetchTasksForActiveDay();
        } else {
            activeDay = null;
            if (displayEl) displayEl.textContent = "البرنامج لم يحدد بعد";
            if (tasksDisplayEl) tasksDisplayEl.textContent = "المهام لم تحدد بعد";

            scheduleList.innerHTML = '<div class="empty-state">البرنامج اليومي غير متاح حالياً</div>';
            const tasksList = document.getElementById('tasks-list');
            if (tasksList) tasksList.innerHTML = '<div class="empty-state">لا توجد مهام متاحة حالياً</div>';

            if (scheduleUnsubscribe) {
                scheduleUnsubscribe();
                scheduleUnsubscribe = null;
            }
            if (tasksUnsubscribe) {
                tasksUnsubscribe();
                tasksUnsubscribe = null;
            }
        }
    });
}

function fetchScheduleForActiveDay() {
    if (!activeDay) return;

    if (scheduleUnsubscribe) scheduleUnsubscribe();

    const scheduleList = document.getElementById('schedule-list');
    const q = query(collection(db, "schedule"), where("day", "==", activeDay), orderBy("order", "asc"));

    scheduleUnsubscribe = onSnapshot(q, (snapshot) => {
        scheduleList.innerHTML = '';
        if (snapshot.empty) {
            scheduleList.innerHTML = '<div class="empty-state">لا يوجد نشاطات مضافة لهذا اليوم</div>';
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const item = document.createElement('div');
            item.className = 'schedule-item';
            item.innerHTML = `
                <div class="schedule-time">${data.time}</div>
                <div class="schedule-title">${data.title}</div>
            `;
            scheduleList.appendChild(item);
        });
    });
}

let tasksUnsubscribe = null;

function listenToTasks() {
    // We don't initialize tasks listener here anymore, it's called by the activeDay listener in listenToSchedule
}

function fetchTasksForActiveDay() {
    if (!activeDay) return;
    if (tasksUnsubscribe) tasksUnsubscribe();

    const tasksList = document.getElementById('tasks-list');
    const q = query(collection(db, "tasks"), where("day", "==", activeDay), orderBy("order", "asc"));

    tasksUnsubscribe = onSnapshot(q, (snapshot) => {
        tasksList.innerHTML = '';
        if (snapshot.empty) {
            tasksList.innerHTML = '<div class="empty-state">لا توجد مهام مضافة لهذا اليوم</div>';
            return;
        }

        snapshot.forEach(async (docRef) => {
            const data = docRef.data();
            let teamName = 'غير محددة';
            if (data.teamId) {
                const teamSnap = await getDoc(doc(db, 'teams', data.teamId));
                if (teamSnap.exists()) teamName = teamSnap.data().name;
            }

            const isMyTeam = data.teamId === userTeam;
            const item = document.createElement('div');
            item.className = `task-card ${isMyTeam ? 'my-task' : ''}`;

            item.innerHTML = `
                <div class="task-icon">
                    <span class="material-symbols-rounded">assignment</span>
                </div>
                <div class="task-info">
                    <h3 class="task-title">${data.title}</h3>
                    <div class="task-assignee">
                        <span class="material-symbols-rounded" style="font-size: 1rem;">group</span>
                        <span>${teamName}</span>
                    </div>
                </div>
                ${isMyTeam ? '<div class="my-task-badge">مهمتي</div>' : ''}
            `;
            tasksList.appendChild(item);
        });
    });
}

function listenToLeaderboard() {
    const leaderboardList = document.getElementById('leaderboard-list');
    const q = query(collection(db, "teams"), orderBy("totalScore", "desc"));

    onSnapshot(q, (snapshot) => {
        leaderboardList.innerHTML = '';
        if (snapshot.empty) {
            leaderboardList.innerHTML = '<div class="empty-state">لم يتم تسجيل أي فرق بعد</div>';
            return;
        }

        let rank = 1;
        snapshot.forEach((doc) => {
            const data = doc.data();
            const item = document.createElement('div');
            item.className = 'leaderboard-item';

            // Highlight user's team
            if (doc.id === userTeam) {
                item.style.background = 'var(--md-sys-color-primary-container)';
            }

            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 16px;">
                    <span style="font-size: 1.5rem; font-weight: 800; color: var(--md-sys-color-primary);">#${rank}</span>
                    <span style="font-weight: 600; font-size: 1.1rem;">${data.name}</span>
                </div>
                <div style="font-size: 1.2rem; font-weight: 700; color: var(--md-sys-color-secondary);">
                    ${data.totalScore || 0} نقطة
                </div>
            `;
            item.style.cursor = 'pointer';
            item.addEventListener('click', () => {
                openPointsLogModal(doc.id, data.name);
            });
            leaderboardList.appendChild(item);
            rank++;
        });
    });
}

// ==============================
// CHAT SYSTEM
// ==============================
let currentChatRoom = 'global';
let chatUnsubscribe = null;

const chatTabs = document.querySelectorAll('.chat-tab-btn');
const chatMessagesContainer = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');

chatTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        chatTabs.forEach(t => {
            t.classList.remove('active');
            t.style.background = 'rgba(255,255,255,0.5)';
            t.style.color = 'var(--md-sys-color-secondary)';
        });

        tab.classList.add('active');
        tab.style.background = 'var(--md-sys-color-primary)';
        tab.style.color = 'white';

        const roomType = tab.getAttribute('data-room');
        if (roomType === 'global') {
            currentChatRoom = 'global';
        } else if (roomType === 'team') {
            if (userRole === 'admin') {
                currentChatRoom = 'admin_chat';
            } else if (userTeam) {
                currentChatRoom = `team_${userTeam}`;
            } else {
                currentChatRoom = 'none'; // Fallback
            }
        }

        listenToChat();
    });
});

function listenToChat() {
    if (chatUnsubscribe) {
        chatUnsubscribe();
    }

    if (currentChatRoom === 'none') {
        chatMessagesContainer.innerHTML = '<div class="empty-state">ليس لديك فرقة مخصصة بعد.</div>';
        return;
    }

    const q = query(collection(db, "chats"), where("roomId", "==", currentChatRoom), orderBy("createdAt", "asc"));

    let isInitialLoad = true;

    chatUnsubscribe = onSnapshot(q, (snapshot) => {
        if (snapshot.empty && isInitialLoad) {
            chatMessagesContainer.innerHTML = '<div class="empty-state">لا توجد رسائل هنا. كن أول من يكتب!</div>';
            isInitialLoad = false;
            return;
        }

        // Remove empty state if present
        const emptyState = chatMessagesContainer.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }

        const userId = currentUser ? currentUser.uid : '';

        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const data = change.doc.data();
                const isMe = data.senderId === userId;

                const msgDiv = document.createElement('div');
                msgDiv.className = `chat-message ${isMe ? 'sent' : 'received'}`;

                const timeStr = data.createdAt ? new Date(data.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '';

                const badgeHTML = data.senderBadge ? `<span style="font-size: 1rem; margin-right: 4px;">${data.senderBadge}</span>` : '';
                msgDiv.innerHTML = `
                    ${!isMe ? `<div class="chat-sender-name">${data.senderName}${badgeHTML}</div>` : ''}
                    <div>${data.text}</div>
                    <div class="chat-timestamp">${timeStr}</div>
                `;

                chatMessagesContainer.appendChild(msgDiv);

                // Notification Logic
                if (!isInitialLoad && !isMe) {
                    if ("Notification" in window && Notification.permission === "granted") {
                        // Check if document is visible to avoid spamming if the user is looking at the chat
                        if (document.hidden || !document.getElementById('chat-section').classList.contains('active')) {
                            const notifTitle = "رسالة جديدة من " + data.senderName;
                            const notifOptions = {
                                body: data.text,
                                icon: '/icon.png' // Optional: if you have an icon
                            };
                            new Notification(notifTitle, notifOptions);
                        }
                    }
                }
            }
        });

        // Auto scroll to bottom on new messages
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

        isInitialLoad = false;
    });
}

// Handle sending messages
chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    if (currentChatRoom === 'none') return;

    const userId = currentUser ? currentUser.uid : 'unknown';
    const senderName = currentUserName || 'عضو المخيم';

    const msgData = {
        roomId: currentChatRoom,
        text: text,
        senderId: userId,
        senderName: senderName,
        senderBadge: userBadge,
        createdAt: new Date().toISOString()
    };

    chatInput.value = ''; // clear immediately for UX

    try {
        await addDoc(collection(db, "chats"), msgData);
    } catch (error) {
        console.error("Error sending message:", error);
        alert("فشل إرسال الرسالة");
    }
});

// ==============================
// GLOBAL NOTIFICATIONS
// ==============================
let isInitialNotifLoad = true;
let notifUnsubscribe = null;

function listenToNotifications() {
    if (notifUnsubscribe) notifUnsubscribe();

    // Listen only to the very last notification to avoid reading history
    const q = query(collection(db, "notifications"), orderBy("timestamp", "desc"), limit(1));

    notifUnsubscribe = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                if (!isInitialNotifLoad) {
                    const data = change.doc.data();

                    // Show notification
                    if ("Notification" in window && Notification.permission === "granted") {
                        new Notification(data.title, {
                            body: data.body,
                            icon: './assets/img/logo.png',
                            requireInteraction: true
                        });
                    } else {
                        // Fallback alert
                        alert(`📢 ${data.title}\n\n${data.body}`);
                    }
                }
            }
        });
        isInitialNotifLoad = false;
    });
}

// ==============================
// POINTS LOG MODAL
// ==============================
const pointsLogModal = document.getElementById('points-log-modal');
const pointsLogCloseBtn = document.getElementById('points-log-close');
const pointsLogTeamName = document.getElementById('points-log-team-name');
const pointsLogTbody = document.getElementById('points-log-tbody');
const pointsLogEmpty = document.getElementById('points-log-empty');

let pointsLogUnsubscribe = null;

if (pointsLogCloseBtn) {
    pointsLogCloseBtn.addEventListener('click', () => {
        pointsLogModal.classList.add('hidden');
        if (pointsLogUnsubscribe) {
            pointsLogUnsubscribe();
            pointsLogUnsubscribe = null;
        }
    });
}

function openPointsLogModal(teamId, teamName) {
    if (!pointsLogModal) return;
    
    pointsLogTeamName.textContent = `سجل علامات: ${teamName}`;
    pointsLogModal.classList.remove('hidden');
    pointsLogTbody.innerHTML = '';
    pointsLogEmpty.classList.add('hidden');
    
    if (pointsLogUnsubscribe) pointsLogUnsubscribe();
    
    const q = query(collection(db, "points_log"), where("teamId", "==", teamId), orderBy("createdAt", "desc"));
    
    pointsLogUnsubscribe = onSnapshot(q, (snapshot) => {
        pointsLogTbody.innerHTML = '';
        if (snapshot.empty) {
            pointsLogEmpty.classList.remove('hidden');
            return;
        }
        
        pointsLogEmpty.classList.add('hidden');
        
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const tr = document.createElement('tr');
            
            const date = new Date(data.createdAt).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
            const amountColor = data.amount > 0 ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-error)';
            const amountSign = data.amount > 0 ? '+' : '';
            
            tr.innerHTML = `
                <td style="color: ${amountColor}; font-weight: bold; padding: 12px; border-bottom: 1px solid var(--glass-border);" dir="ltr">${amountSign}${data.amount}</td>
                <td style="padding: 12px; border-bottom: 1px solid var(--glass-border);">${data.reason}</td>
                <td style="padding: 12px; border-bottom: 1px solid var(--glass-border); font-size: 0.9rem; opacity: 0.8;">${date}</td>
            `;
            pointsLogTbody.appendChild(tr);
        });
    });
}

// ==============================
// TRIVIA
// ==============================
const triviaEmptyState = document.getElementById('trivia-empty-state');
const triviaActiveState = document.getElementById('trivia-active-state');
const triviaSolvedState = document.getElementById('trivia-solved-state');
const triviaQuestion = document.getElementById('trivia-question');
const triviaOptions = document.getElementById('trivia-options');
const triviaPointsDisplay = document.getElementById('trivia-points-display');
const triviaWinnerText = document.getElementById('trivia-winner-text');

let currentTriviaData = null;

function listenToTrivia() {
    onSnapshot(doc(db, "trivia", "active"), async (docSnap) => {
        if (!docSnap.exists() || !docSnap.data().isActive) {
            if(triviaEmptyState) triviaEmptyState.classList.remove('hidden');
            if(triviaActiveState) triviaActiveState.classList.add('hidden');
            if(triviaSolvedState) triviaSolvedState.classList.add('hidden');
            return;
        }

        const data = docSnap.data();
        currentTriviaData = data;
        
        if (data.winnerTeamId) {
            // Already solved
            if(triviaEmptyState) triviaEmptyState.classList.add('hidden');
            if(triviaActiveState) triviaActiveState.classList.add('hidden');
            if(triviaSolvedState) triviaSolvedState.classList.remove('hidden');
            
            let wName = 'فرقة غير معروفة';
            if (data.winnerTeamId) {
                const ts = await getDoc(doc(db, 'teams', data.winnerTeamId));
                if (ts.exists()) wName = ts.data().name;
            }
            if(triviaWinnerText) triviaWinnerText.textContent = `فازت بها ${wName} (+${data.points} نقطة)`;
            return;
        }

        // Active and not solved
        if(triviaEmptyState) triviaEmptyState.classList.add('hidden');
        if(triviaActiveState) triviaActiveState.classList.remove('hidden');
        if(triviaSolvedState) triviaSolvedState.classList.add('hidden');

        if(triviaQuestion) triviaQuestion.textContent = data.question;
        if(triviaPointsDisplay) triviaPointsDisplay.textContent = `النقاط: ${data.points}`;
        
        if(triviaOptions) {
            triviaOptions.innerHTML = '';
            data.options.forEach((opt, idx) => {
                const btn = document.createElement('button');
                btn.className = 'btn btn-secondary btn-large';
                btn.style.textAlign = 'right';
                btn.textContent = opt;
                btn.onclick = () => submitTriviaAnswer(idx);
                triviaOptions.appendChild(btn);
            });
        }
    });
}

async function submitTriviaAnswer(selectedIndex) {
    if (!currentTriviaData || !currentTriviaData.isActive || currentTriviaData.winnerTeamId) return;
    if (!userTeam) {
        alert("يجب أن تكون ضمن فرقة للإجابة!");
        return;
    }
    
    if (selectedIndex === currentTriviaData.correctIndex) {
        try {
            // Try to claim the win
            await updateDoc(doc(db, "trivia", "active"), {
                winnerTeamId: userTeam
            });
            
            // Add points to team
            const teamRef = doc(db, 'teams', userTeam);
            const ts = await getDoc(teamRef);
            if(ts.exists()){
                await updateDoc(teamRef, {
                    totalScore: (ts.data().totalScore || 0) + currentTriviaData.points
                });
            }
            
            // Log points
            await addDoc(collection(db, "points_log"), {
                teamId: userTeam,
                amount: currentTriviaData.points,
                reason: `الفوز بمسابقة: ${currentTriviaData.question}`,
                createdAt: new Date().toISOString()
            });
            
            alert('إجابة صحيحة! مبروك لفرقتك 🎉');
        } catch(err) {
            console.error(err);
            alert("حدث خطأ أثناء تسجيل إجابتك، ربما سبقك فريق آخر!");
        }
    } else {
        alert('إجابة خاطئة! حظاً أوفر.');
    }
}

// ==============================
// MEMORIES
// ==============================
let memoryUsersCache = [];
let targetMemoryUserId = null;

const tabMyMemories = document.getElementById('tab-my-memories');
const tabWriteMemory = document.getElementById('tab-write-memory');
const myMemoriesContainer = document.getElementById('my-memories-container');
const writeMemoryContainer = document.getElementById('write-memory-container');

if (tabMyMemories && tabWriteMemory) {
    tabMyMemories.addEventListener('click', () => {
        tabMyMemories.className = 'btn btn-primary';
        tabWriteMemory.className = 'btn btn-secondary';
        myMemoriesContainer.classList.remove('hidden');
        writeMemoryContainer.classList.add('hidden');
    });

    tabWriteMemory.addEventListener('click', () => {
        tabWriteMemory.className = 'btn btn-primary';
        tabMyMemories.className = 'btn btn-secondary';
        writeMemoryContainer.classList.remove('hidden');
        myMemoriesContainer.classList.add('hidden');
        if(memoryUsersCache.length === 0) fetchMemoryUsers();
    });
}

function listenToMemories() {
    if (!currentUser) return;
    const q = query(collection(db, "memories"), where("toUserId", "==", currentUser.uid), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        const list = document.getElementById('my-memories-list');
        if (!list) return;
        list.innerHTML = '';
        if (snapshot.empty) {
            list.innerHTML = '<div class="empty-state">لم يكتب لك أحد بعد. بادر أنت بالكتابة لأصدقائك!</div>';
            return;
        }
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const div = document.createElement('div');
            div.className = 'glass-card';
            div.style.padding = '16px';
            div.innerHTML = `
                <div style="font-weight:bold; color:var(--md-sys-color-primary); margin-bottom:8px;">من: ${data.fromUserName}</div>
                <div style="white-space: pre-wrap;">${data.text}</div>
            `;
            list.appendChild(div);
        });
    });
}

async function fetchMemoryUsers() {
    const list = document.getElementById('memory-users-list');
    if (!list) return;
    list.innerHTML = 'جاري التحميل...';
    try {
        const q = query(collection(db, "users"));
        const snap = await getDocs(q);
        memoryUsersCache = [];
        snap.forEach(d => {
            if(d.id !== currentUser.uid) { // Don't show myself
                memoryUsersCache.push({ id: d.id, ...d.data() });
            }
        });
        renderMemoryUsers(memoryUsersCache);
    } catch(e) {
        console.error(e);
        list.innerHTML = 'خطأ في تحميل المشتركين';
    }
}

function renderMemoryUsers(usersList) {
    const list = document.getElementById('memory-users-list');
    if (!list) return;
    list.innerHTML = '';
    usersList.forEach(u => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-secondary';
        btn.style.padding = '12px';
        btn.textContent = u.name;
        btn.onclick = () => openMemoryModal(u.id, u.name);
        list.appendChild(btn);
    });
}

const memoryUserSearch = document.getElementById('memory-user-search');
if (memoryUserSearch) {
    memoryUserSearch.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = memoryUsersCache.filter(u => u.name.toLowerCase().includes(term));
        renderMemoryUsers(filtered);
    });
}

function openMemoryModal(id, name) {
    targetMemoryUserId = id;
    document.getElementById('memory-to-name').textContent = name;
    document.getElementById('memory-text').value = '';
    document.getElementById('write-memory-modal').classList.remove('hidden');
}

const btnCancelMemory = document.getElementById('btn-cancel-memory');
if (btnCancelMemory) {
    btnCancelMemory.addEventListener('click', () => {
        document.getElementById('write-memory-modal').classList.add('hidden');
    });
}

const btnSubmitMemory = document.getElementById('btn-submit-memory');
if (btnSubmitMemory) {
    btnSubmitMemory.addEventListener('click', async () => {
        const text = document.getElementById('memory-text').value.trim();
        if(!text) return;
        
        btnSubmitMemory.disabled = true;
        try {
            await addDoc(collection(db, "memories"), {
                fromUserId: currentUser.uid,
                fromUserName: currentUserName,
                toUserId: targetMemoryUserId,
                text: text,
                createdAt: new Date().toISOString()
            });
            alert('تم إرسال الذكرى بنجاح! 💌');
            document.getElementById('write-memory-modal').classList.add('hidden');
        } catch(e) {
            console.error(e);
            alert('حدث خطأ');
        }
        btnSubmitMemory.disabled = false;
    });
}

// ==============================
// PWA INSTALLATION (Service Worker)
// ==============================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registered', reg))
            .catch(err => console.error('Service Worker registration failed', err));
    });
}

let deferredPrompt;
const installBtn = document.getElementById('install-btn');

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    // Update UI notify the user they can install the PWA
    if (installBtn) {
        installBtn.classList.remove('hidden');
    }
});

if (installBtn) {
    installBtn.addEventListener('click', async () => {
        if (deferredPrompt) {
            // Show the install prompt
            deferredPrompt.prompt();
            // Wait for the user to respond to the prompt
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User response to the install prompt: ${outcome}`);
            // We've used the prompt, and can't use it again, throw it away
            deferredPrompt = null;
            installBtn.classList.add('hidden');
        }
    });
}

window.addEventListener('appinstalled', (evt) => {
    console.log('App was installed successfully.');
    if (installBtn) installBtn.classList.add('hidden');
});

// Explicitly check if app is already running in standalone mode (installed)
if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
    if (installBtn) installBtn.classList.add('hidden');
}
