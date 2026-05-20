import { db } from './firebase-config.js';
import { userTeam, userRole, currentUser, currentUserName } from './auth.js';
import { collection, query, orderBy, onSnapshot, doc, getDoc, where, addDoc, limit } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Navigation Logic
const navItems = document.querySelectorAll('.nav-item[data-target]');
const contentSections = document.querySelectorAll('.content-section');

navItems.forEach(item => {
    item.addEventListener('click', () => {
        // Remove active class from all
        navItems.forEach(nav => nav.classList.remove('active'));
        contentSections.forEach(section => section.classList.add('hidden'));
        contentSections.forEach(section => section.classList.remove('active'));

        // Add active to clicked
        item.classList.add('active');
        const targetId = item.getAttribute('data-target');
        const targetSection = document.getElementById(targetId);
        targetSection.classList.remove('hidden');

        // Small delay for animation
        setTimeout(() => targetSection.classList.add('active'), 10);
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

    // Request Notification Permission
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
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

                msgDiv.innerHTML = `
                    ${!isMe ? `<div class="chat-sender-name">${data.senderName}</div>` : ''}
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
});
