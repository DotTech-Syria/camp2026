import { db } from './firebase-config.js';
import { collection, query, getDocs, addDoc, deleteDoc, doc, updateDoc, onSnapshot, orderBy, increment, setDoc, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Admin Navigation
const navItems = document.querySelectorAll('.sidebar-nav .nav-item[data-target]');
const adminSections = document.querySelectorAll('.admin-section');

navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(nav => nav.classList.remove('active'));
        adminSections.forEach(section => section.classList.add('hidden'));

        item.classList.add('active');
        const targetId = item.getAttribute('data-target');
        document.getElementById(targetId).classList.remove('hidden');
    });
});

window.addEventListener('adminAuthReady', () => {
    initAdmin();
});

function initAdmin() {
    listenToTeams();
    listenToUsers();
    listenToTasks();
    listenToSchedule();
    listenToPoints();
    listenToAdminGallery();
    listenToTrivia();
    listenToAdminMemories();
    // listenToAdminChat(); // Disabled to reduce database reads
}

// ==============================
// TEAMS MANAGEMENT
// ==============================
document.getElementById('btn-add-team').addEventListener('click', async () => {
    const teamName = prompt("أدخل اسم الفرقة الجديدة:");
    if (teamName && teamName.trim() !== "") {
        try {
            await addDoc(collection(db, "teams"), {
                name: teamName,
                totalScore: 0,
                createdAt: new Date().toISOString()
            });
        } catch (error) {
            console.error("Error adding team:", error);
            alert("حدث خطأ أثناء إضافة الفرقة");
        }
    }
});

let teamsCache = {}; // id -> data

function listenToTeams() {
    const teamsList = document.getElementById('admin-teams-list');
    onSnapshot(collection(db, "teams"), (snapshot) => {
        teamsList.innerHTML = '';
        teamsCache = {};
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            teamsCache[docSnap.id] = data;

            const card = document.createElement('div');
            card.className = 'team-card';
            card.innerHTML = `
                <div class="team-card-header">
                    <h3 style="margin: 0;">${data.name}</h3>
                    <button class="btn btn-icon btn-delete-team" data-id="${docSnap.id}" style="color: var(--md-sys-color-error);">
                        <span class="material-symbols-rounded">delete</span>
                    </button>
                </div>
                <div class="members-list drop-zone" id="team-members-${docSnap.id}" data-team-id="${docSnap.id}" data-role="member">
                    <!-- Members will be injected here by listenToUsers -->
                </div>
            `;
            teamsList.appendChild(card);
        });

        // Add delete listeners
        document.querySelectorAll('.btn-delete-team').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (confirm("هل أنت متأكد من حذف هذه الفرقة؟")) {
                    await deleteDoc(doc(db, "teams", e.currentTarget.getAttribute('data-id')));
                }
            });
        });

        // Re-render users if cache updated
        renderUsers();
        // Re-render task teams pool
        updateTasksTeamsPool();
    });
}

// ==============================
// USERS MANAGEMENT
// ==============================
let usersCache = [];

function listenToUsers() {
    onSnapshot(collection(db, "users"), (snapshot) => {
        usersCache = [];
        snapshot.forEach((doc) => {
            usersCache.push({ id: doc.id, ...doc.data() });
        });
        renderUsers();
    });
}

function renderUsers() {
    const unassignedList = document.getElementById('unassigned-members-list');
    const adminList = document.getElementById('admin-members-list');

    unassignedList.innerHTML = '';
    if (adminList) adminList.innerHTML = '';



    // Clear team containers
    Object.keys(teamsCache).forEach(teamId => {
        const container = document.getElementById(`team-members-${teamId}`);
        if (container) container.innerHTML = '';
    });

    usersCache.forEach(user => {
        const chip = document.createElement('div');
        chip.className = 'member-chip';
        chip.draggable = true;
        chip.setAttribute('data-user-id', user.id);
        const badgeHTML = user.badge ? `<span style="margin-left:4px; font-size:1.1rem;">${user.badge}</span>` : '';
        const avatarUrl = user.photoURL || (() => {
            const colors = ['74f8e5', 'cce8e2', 'cde5ff', 'ffdcc0', 'ffb4ab', 'e2e2e2', 'd0e4ff', 'b6e3f4', 'ffd1dc', 'e8e0d5'];
            const charSum = [...user.name].reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const chosenColor = colors[charSum % colors.length];
            return `https://api.dicebear.com/9.x/notionists-neutral/svg?seed=${encodeURIComponent(user.name)}&backgroundColor=${chosenColor}`;
        })();
        chip.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px; width:100%; text-align:right;">
                <img src="${avatarUrl}" alt="Avatar" style="width:32px; height:32px; border-radius:50%; background:var(--md-sys-color-primary-container); flex-shrink:0;">
                <div style="display:flex; flex-direction:column; align-items:flex-start; flex-grow:1;">
                    <div><span>${user.name}</span>${badgeHTML}</div>
                    <small style="font-family:monospace; opacity:0.8; margin-top:2px; background: rgba(0,0,0,0.1); padding: 2px 6px; border-radius: 4px; user-select: all;" title="انسخ هذا الكود للعميل">${user.id}</small>
                </div>
            </div>
        `;
        chip.title = "انقر مرتين لإدارة العضو (الأوسمة)";

        // Add drag events
        chip.addEventListener('dragstart', () => {
            chip.classList.add('dragging');
        });
        chip.addEventListener('dragend', () => {
            chip.classList.remove('dragging');
        });

        // Add double click to manage user
        chip.addEventListener('dblclick', () => {
            openUserManageModal(user);
        });

        if (user.role === 'admin') {
            if (adminList) adminList.appendChild(chip);
        } else if (user.teamId && teamsCache[user.teamId]) {
            const container = document.getElementById(`team-members-${user.teamId}`);
            if (container) container.appendChild(chip);
        } else {
            unassignedList.appendChild(chip);
        }
    });

    setupDropZones();
}

function setupDropZones() {
    document.querySelectorAll('.drop-zone').forEach(zone => {
        if (zone.dataset.hasDropListener) return;
        zone.dataset.hasDropListener = 'true';

        zone.addEventListener('dragover', e => {
            e.preventDefault(); // Necessary to allow dropping
            zone.classList.add('drag-over');
        });

        zone.addEventListener('dragleave', () => {
            zone.classList.remove('drag-over');
        });

        zone.addEventListener('drop', async (e) => {
            e.preventDefault();
            zone.classList.remove('drag-over');

            const draggingChip = document.querySelector('.dragging');
            if (!draggingChip) return;

            const userId = draggingChip.getAttribute('data-user-id');
            const newTeamId = zone.getAttribute('data-team-id') === 'null' ? null : zone.getAttribute('data-team-id');
            const newRole = zone.getAttribute('data-role'); // 'admin' or 'member'

            // Optimistic UI update
            zone.appendChild(draggingChip);

            // Update Firestore
            try {
                await updateDoc(doc(db, "users", userId), {
                    teamId: newTeamId,
                    role: newRole
                });
            } catch (error) {
                console.error("Error updating user:", error);
                alert("حدث خطأ أثناء نقل العضو");
            }
        });
    });
}

const tasksDaySelect = document.getElementById('tasks-day-select');
let tasksCache = [];
let tasksUnsubscribe = null;

// Add new task
document.getElementById('btn-add-task').addEventListener('click', async () => {
    const title = prompt("أدخل اسم المهمة (مثال: جلي الغداء):");
    if (!title) return;

    const day = tasksDaySelect.value;
    const nextOrder = tasksCache.length;

    try {
        await addDoc(collection(db, "tasks"), {
            day: day,
            title: title,
            teamId: null,
            grade: null,
            order: nextOrder,
            createdAt: new Date().toISOString()
        });
    } catch (error) {
        console.error("Error adding task:", error);
    }
});

tasksDaySelect.addEventListener('change', () => {
    listenToTasks();
});

// Update Teams Pool for Tasks
function updateTasksTeamsPool() {
    const pool = document.getElementById('tasks-teams-pool');
    if (!pool) return;

    // Also update points board select
    const pointSelect = document.getElementById('point-team-select');
    if (pointSelect) {
        pointSelect.innerHTML = '<option value="">-- اختر الفرقة --</option>';
    }

    pool.innerHTML = '';
    Object.keys(teamsCache).forEach(teamId => {
        // Pool
        const pill = document.createElement('div');
        pill.className = 'team-pill';
        pill.draggable = true;
        pill.setAttribute('data-team-id', teamId);
        pill.textContent = teamsCache[teamId].name;

        pill.addEventListener('dragstart', () => {
            pill.classList.add('dragging');
        });
        pill.addEventListener('dragend', () => {
            pill.classList.remove('dragging');
        });

        pool.appendChild(pill);

        // Point Select
        if (pointSelect) {
            const option = document.createElement('option');
            option.value = teamId;
            option.textContent = teamsCache[teamId].name;
            pointSelect.appendChild(option);
        }
    });

    // Also update Admin Chat Room Select
    const adminChatSelect = document.getElementById('admin-chat-room-select');
    if (adminChatSelect) {
        adminChatSelect.innerHTML = `
            <option value="global">المحادثة العامة</option>
            <option value="admin_chat">محادثة الإداريين</option>
        `;
        Object.keys(teamsCache).forEach(teamId => {
            const option = document.createElement('option');
            option.value = `team_${teamId}`;
            option.textContent = `محادثة ${teamsCache[teamId].name}`;
            adminChatSelect.appendChild(option);
        });
    }
}

function listenToTasks() {
    if (tasksUnsubscribe) tasksUnsubscribe();

    const list = document.getElementById('admin-tasks-list');
    if (!list) return;

    const selectedDay = tasksDaySelect.value;
    // We will use order ascending
    const q = query(collection(db, "tasks"), where("day", "==", selectedDay), orderBy("order", "asc"));

    tasksUnsubscribe = onSnapshot(q, (snapshot) => {
        list.innerHTML = '';
        tasksCache = [];

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            tasksCache.push({ id: docSnap.id, ...data });

            const teamName = data.teamId && teamsCache[data.teamId] ? teamsCache[data.teamId].name : 'غير محددة';
            const teamBadgeStyle = data.teamId ? 'background: var(--md-sys-color-primary); color: white;' : 'background: var(--glass-border); color: black;';

            const item = document.createElement('div');
            item.className = 'schedule-item draggable task-item-container';
            item.draggable = true;
            item.setAttribute('data-id', docSnap.id);
            item.setAttribute('data-type', 'task');

            item.innerHTML = `
                <div style="display:flex; gap: 16px; align-items: center; flex: 1;">
                    <span class="material-symbols-rounded" style="color: var(--md-sys-color-secondary); cursor: grab;">drag_indicator</span>
                    <input type="text" class="schedule-edit-input" style="flex: 1;" data-id="${docSnap.id}" data-field="title" value="${data.title}">
                    
                    <!-- Team Assignment Area (Drop Zone) -->
                    <div class="task-team-drop-zone badge" style="${teamBadgeStyle} padding: 8px 16px; min-width: 100px; text-align: center; cursor: pointer;">
                        ${teamName}
                    </div>
                </div>
                <button class="btn btn-icon btn-delete-task" data-id="${docSnap.id}" style="color: var(--md-sys-color-error);">
                    <span class="material-symbols-rounded">delete</span>
                </button>
            `;
            list.appendChild(item);

            // Setup team drop zone
            const dropZone = item.querySelector('.task-team-drop-zone');
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                // Only allow dropping team pills, not tasks
                const draggingPill = document.querySelector('.team-pill.dragging');
                if (draggingPill) {
                    item.classList.add('drag-over');
                }
            });
            dropZone.addEventListener('dragleave', () => {
                item.classList.remove('drag-over');
            });
            dropZone.addEventListener('drop', async (e) => {
                e.preventDefault();
                item.classList.remove('drag-over');
                const draggingPill = document.querySelector('.team-pill.dragging');
                if (!draggingPill) return;

                const newTeamId = draggingPill.getAttribute('data-team-id');
                try {
                    await updateDoc(doc(db, "tasks", docSnap.id), { teamId: newTeamId });
                } catch (err) {
                    console.error(err);
                }
            });

            // Unassign on click
            dropZone.addEventListener('dblclick', async () => {
                if (data.teamId && confirm("إلغاء تعيين الفرقة؟")) {
                    await updateDoc(doc(db, "tasks", docSnap.id), { teamId: null });
                }
            });
        });

        setupTasksDragAndDrop();
        setupTasksInlineEdit();

        // Add Listeners
        document.querySelectorAll('.btn-delete-task').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (confirm("حذف المهمة؟")) {
                    await deleteDoc(doc(db, "tasks", e.currentTarget.getAttribute('data-id')));
                }
            });
        });
    });
}

function setupTasksInlineEdit() {
    document.querySelectorAll('#admin-tasks-list .schedule-edit-input[data-field]').forEach(input => {
        input.addEventListener('change', async (e) => {
            const id = e.target.getAttribute('data-id');
            const field = e.target.getAttribute('data-field');
            const value = e.target.value;
            try {
                await updateDoc(doc(db, "tasks", id), { [field]: value });
            } catch (error) {
                console.error("Error updating task:", error);
            }
        });
    });
}

function setupTasksDragAndDrop() {
    const items = document.querySelectorAll('#admin-tasks-list .schedule-item.draggable');
    const container = document.getElementById('admin-tasks-list');

    items.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            if (!e.target.classList.contains('team-pill')) {
                item.classList.add('dragging-task');
            }
        });

        item.addEventListener('dragend', async () => {
            item.classList.remove('dragging-task');
            items.forEach(i => {
                i.classList.remove('drag-over-top');
                i.classList.remove('drag-over-bottom');
            });

            const currentItems = [...container.querySelectorAll('.schedule-item.draggable')];
            currentItems.forEach(async (el, index) => {
                const id = el.getAttribute('data-id');
                const cached = tasksCache.find(t => t.id === id);
                if (cached && cached.order !== index) {
                    await updateDoc(doc(db, "tasks", id), { order: index });
                }
            });
        });
    });

    container.addEventListener('dragover', e => {
        e.preventDefault();
        const draggable = document.querySelector('.dragging-task');
        if (draggable) {
            const afterElement = getDragAfterElementForTasks(container, e.clientY);
            if (afterElement == null) {
                container.appendChild(draggable);
            } else {
                container.insertBefore(draggable, afterElement);
            }
        }
    });
}

function getDragAfterElementForTasks(container, y) {
    const draggableElements = [...container.querySelectorAll('.schedule-item.draggable:not(.dragging-task)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// ==============================
// POINTS BOARD MANAGEMENT
// ==============================
document.getElementById('btn-add-points').addEventListener('click', async () => {
    const teamId = document.getElementById('point-team-select').value;
    const amount = parseInt(document.getElementById('point-amount').value);
    const reason = document.getElementById('point-reason').value;

    if (!teamId || isNaN(amount) || !reason) {
        return alert("يرجى ملء جميع الحقول.");
    }

    try {
        // Log points
        await addDoc(collection(db, "points_log"), {
            teamId: teamId,
            amount: amount,
            reason: reason,
            createdAt: new Date().toISOString()
        });

        // Update team score
        await updateDoc(doc(db, "teams", teamId), {
            totalScore: increment(amount)
        });

        // Reset fields
        document.getElementById('point-amount').value = '';
        document.getElementById('point-reason').value = '';

        alert(`تم إضافة ${amount} نقطة لفرقة ${teamsCache[teamId].name}.`);
    } catch (error) {
        console.error("Error adding points:", error);
    }
});

function listenToPoints() {
    const tbody = document.getElementById('admin-points-tbody');
    const q = query(collection(db, "points_log"), orderBy("createdAt", "desc"));

    onSnapshot(q, (snapshot) => {
        tbody.innerHTML = '';
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const tr = document.createElement('tr');

            const teamName = data.teamId && teamsCache[data.teamId] ? teamsCache[data.teamId].name : 'محذوفة';
            const date = new Date(data.createdAt).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const amountColor = data.amount > 0 ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-error)';
            const amountSign = data.amount > 0 ? '+' : '';

            tr.innerHTML = `
                <td>${date}</td>
                <td style="font-weight: bold;">${teamName}</td>
                <td style="color: ${amountColor}; font-weight: bold; font-size: 1.1rem;" dir="ltr">${amountSign}${data.amount}</td>
                <td>${data.reason}</td>
                <td>
                    <button class="btn btn-icon btn-delete-points" data-id="${docSnap.id}" data-team-id="${data.teamId}" data-amount="${data.amount}" style="color: var(--md-sys-color-error);" title="تراجع وحذف">
                        <span class="material-symbols-rounded">undo</span>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        document.querySelectorAll('.btn-delete-points').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (confirm("هل أنت متأكد من التراجع عن هذه النقاط؟ سيتم خصمها من الفرقة.")) {
                    const id = e.currentTarget.getAttribute('data-id');
                    const teamId = e.currentTarget.getAttribute('data-team-id');
                    const amount = parseInt(e.currentTarget.getAttribute('data-amount'));

                    try {
                        await deleteDoc(doc(db, "points_log", id));
                        // Revert score
                        await updateDoc(doc(db, "teams", teamId), {
                            totalScore: increment(-amount)
                        });
                    } catch (err) {
                        console.error(err);
                    }
                }
            });
        });
    });
}

// ==============================
// SCHEDULE MANAGEMENT
// ==============================
const daySelect = document.getElementById('schedule-day-select');
const btnSetActiveDay = document.getElementById('btn-set-active-day');
const activeDayBadge = document.getElementById('active-day-badge');

let scheduleCache = [];

// Listen to Active Day
onSnapshot(doc(db, "settings", "campState"), (docSnap) => {
    if (docSnap.exists() && docSnap.data().activeDay) {
        activeDayBadge.textContent = `اليوم النشط: ${docSnap.data().activeDay}`;
    } else {
        activeDayBadge.textContent = `اليوم النشط: غير محدد`;
    }
});

btnSetActiveDay.addEventListener('click', async () => {
    const selectedDay = daySelect.value;
    try {
        await setDoc(doc(db, "settings", "campState"), { activeDay: selectedDay }, { merge: true });
        alert(`تم تعيين "${selectedDay}" كاليوم النشط للأعضاء.`);
    } catch (error) {
        console.error("Error setting active day:", error);
    }
});

daySelect.addEventListener('change', () => {
    listenToSchedule();
});

document.getElementById('btn-add-schedule').addEventListener('click', async () => {
    const time = prompt("أدخل الوقت (مثال: 08:00 ص):");
    if (!time) return;
    const title = prompt("أدخل النشاط:");
    if (!title) return;

    const day = daySelect.value;
    const nextOrder = scheduleCache.length;

    try {
        await addDoc(collection(db, "schedule"), {
            day: day,
            time: time,
            title: title,
            order: nextOrder
        });
    } catch (error) {
        console.error("Error adding schedule item:", error);
    }
});

let scheduleUnsubscribe = null;

function listenToSchedule() {
    if (scheduleUnsubscribe) scheduleUnsubscribe();

    const list = document.getElementById('admin-schedule-list');
    const selectedDay = daySelect.value;
    const q = query(collection(db, "schedule"), where("day", "==", selectedDay), orderBy("order", "asc"));

    scheduleUnsubscribe = onSnapshot(q, (snapshot) => {
        list.innerHTML = '';
        scheduleCache = [];

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            scheduleCache.push({ id: docSnap.id, ...data });

            const item = document.createElement('div');
            item.className = 'schedule-item draggable';
            item.draggable = true;
            item.setAttribute('data-id', docSnap.id);

            item.innerHTML = `
                <div style="display:flex; gap: 16px; align-items: center; flex: 1;">
                    <span class="material-symbols-rounded" style="color: var(--md-sys-color-secondary); cursor: grab;">drag_indicator</span>
                    <input type="text" class="schedule-edit-input time-input" data-id="${docSnap.id}" data-field="time" value="${data.time}">
                    <input type="text" class="schedule-edit-input" style="flex: 1;" data-id="${docSnap.id}" data-field="title" value="${data.title}">
                </div>
                <button class="btn btn-icon btn-delete-schedule" data-id="${docSnap.id}" style="color: var(--md-sys-color-error);">
                    <span class="material-symbols-rounded">delete</span>
                </button>
            `;
            list.appendChild(item);
        });

        setupScheduleDragAndDrop();
        setupScheduleInlineEdit();

        document.querySelectorAll('.btn-delete-schedule').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (confirm("حذف النشاط؟")) {
                    await deleteDoc(doc(db, "schedule", e.currentTarget.getAttribute('data-id')));
                }
            });
        });
    });
}

function setupScheduleInlineEdit() {
    document.querySelectorAll('.schedule-edit-input').forEach(input => {
        input.addEventListener('change', async (e) => {
            const id = e.target.getAttribute('data-id');
            const field = e.target.getAttribute('data-field');
            const value = e.target.value;

            try {
                await updateDoc(doc(db, "schedule", id), {
                    [field]: value
                });
            } catch (error) {
                console.error("Error updating schedule item:", error);
            }
        });
    });
}

function setupScheduleDragAndDrop() {
    const items = document.querySelectorAll('.schedule-item.draggable');
    const container = document.getElementById('admin-schedule-list');

    items.forEach(item => {
        item.addEventListener('dragstart', () => {
            item.classList.add('dragging');
        });

        item.addEventListener('dragend', async () => {
            item.classList.remove('dragging');
            // Remove over classes
            items.forEach(i => {
                i.classList.remove('drag-over-top');
                i.classList.remove('drag-over-bottom');
            });

            // Re-calculate orders based on DOM position
            const currentItems = [...container.querySelectorAll('.schedule-item.draggable')];
            currentItems.forEach(async (el, index) => {
                const id = el.getAttribute('data-id');
                // Only update if order changed to save writes
                const cached = scheduleCache.find(s => s.id === id);
                if (cached && cached.order !== index) {
                    await updateDoc(doc(db, "schedule", id), { order: index });
                }
            });
        });
    });

    container.addEventListener('dragover', e => {
        e.preventDefault();
        const afterElement = getDragAfterElement(container, e.clientY);
        const draggable = document.querySelector('.dragging');
        if (draggable) {
            if (afterElement == null) {
                container.appendChild(draggable);
            } else {
                container.insertBefore(draggable, afterElement);
            }
        }
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.schedule-item.draggable:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// ==============================
// CHAT MONITORING
// ==============================
let adminChatUnsubscribe = null;
const adminChatSelect = document.getElementById('admin-chat-room-select');
const adminChatMessages = document.getElementById('admin-chat-messages');
const adminChatForm = document.getElementById('admin-chat-form');
const adminChatInput = document.getElementById('admin-chat-input');

if (adminChatSelect) {
    adminChatSelect.addEventListener('change', listenToAdminChat);
}

function listenToAdminChat() {
    if (adminChatUnsubscribe) {
        adminChatUnsubscribe();
    }

    if (!adminChatSelect || !adminChatMessages) return;

    const currentRoom = adminChatSelect.value;
    const q = query(collection(db, "chats"), where("roomId", "==", currentRoom), orderBy("createdAt", "asc"));

    adminChatUnsubscribe = onSnapshot(q, (snapshot) => {
        adminChatMessages.innerHTML = '';
        if (snapshot.empty) {
            adminChatMessages.innerHTML = '<div class="empty-state">لا توجد رسائل في هذه الغرفة.</div>';
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();

            const msgDiv = document.createElement('div');
            msgDiv.className = `chat-message received`;
            msgDiv.style.width = '100%';
            msgDiv.style.display = 'flex';
            msgDiv.style.justifyContent = 'space-between';
            msgDiv.style.alignItems = 'center';
            msgDiv.style.gap = '16px';

            const timeStr = data.createdAt ? new Date(data.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '';

            msgDiv.innerHTML = `
                <div style="flex: 1;">
                    <div class="chat-sender-name">${data.senderName} <span style="font-weight: normal; opacity: 0.7; font-size: 0.7rem;">(${timeStr})</span></div>
                    <div>${data.text}</div>
                </div>
                <button class="btn btn-icon btn-delete-chat-msg" data-id="${docSnap.id}" style="color: var(--md-sys-color-error); flex-shrink: 0;" title="حذف الرسالة">
                    <span class="material-symbols-rounded">delete</span>
                </button>
            `;

            adminChatMessages.appendChild(msgDiv);
        });

        // Setup delete buttons
        document.querySelectorAll('.btn-delete-chat-msg').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (confirm("هل أنت متأكد من حذف هذه الرسالة؟")) {
                    const msgId = e.currentTarget.getAttribute('data-id');
                    try {
                        await deleteDoc(doc(db, "chats", msgId));
                    } catch (err) {
                        console.error(err);
                    }
                }
            });
        });

        // Auto scroll
        adminChatMessages.scrollTop = adminChatMessages.scrollHeight;
    });
}

// Send message as Admin
if (adminChatForm) {
    adminChatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = adminChatInput.value.trim();
        const currentRoom = adminChatSelect.value;
        if (!text || !currentRoom) return;

        const msgData = {
            roomId: currentRoom,
            text: text,
            senderId: 'admin_sys', // special id for admin panel
            senderName: 'الإدارة',
            createdAt: new Date().toISOString()
        };

        adminChatInput.value = '';

        try {
            await addDoc(collection(db, "chats"), msgData);
        } catch (error) {
            console.error("Error sending message:", error);
            alert("فشل إرسال الرسالة");
        }
    });
}

// ==============================
// GLOBAL NOTIFICATIONS
// ==============================
const adminNotifForm = document.getElementById('admin-notif-form');
if (adminNotifForm) {
    adminNotifForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('notif-title').value;
        const body = document.getElementById('notif-body').value;

        if (!title || !body) return;

        try {
            await addDoc(collection(db, "notifications"), {
                title: title,
                body: body,
                timestamp: new Date().toISOString(),
                sender: 'الإدارة'
            });
            alert('تم إرسال الإشعار للجميع بنجاح! 📢');
            adminNotifForm.reset();
        } catch (error) {
            console.error("Error sending notification:", error);
            alert("فشل إرسال الإشعار");
        }
    });
}

// ==============================
// GALLERY MANAGEMENT
// ==============================
let adminGalleryUnsubscribe = null;
let adminCommentsUnsubscribe = null;
const adminGalleryGrid = document.getElementById('admin-gallery-grid');
const adminCommentsModal = document.getElementById('admin-comments-modal');
const adminModalClose = document.getElementById('admin-modal-close');
const adminCommentsList = document.getElementById('admin-comments-list');

if (adminModalClose) {
    adminModalClose.addEventListener('click', () => {
        adminCommentsModal.classList.add('hidden');
        if (adminCommentsUnsubscribe) {
            adminCommentsUnsubscribe();
            adminCommentsUnsubscribe = null;
        }
    });
}

function listenToAdminGallery() {
    if (!adminGalleryGrid) return;
    if (adminGalleryUnsubscribe) adminGalleryUnsubscribe();

    const q = query(collection(db, "gallery"), orderBy("createdAt", "desc"));

    adminGalleryUnsubscribe = onSnapshot(q, (snapshot) => {
        adminGalleryGrid.innerHTML = '';
        let hasItems = false;
        
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            
            hasItems = true;

            const item = document.createElement('div');
            item.className = 'gallery-item';
            const previewUrl = `https://drive.google.com/thumbnail?id=${data.driveId}&sz=w800`;

            item.innerHTML = `
                <img src="${previewUrl}" alt="Camp Photo" style="width: 100%; height: 100%; object-fit: cover;">
                <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.7); color:white; padding:6px; font-size:0.75rem; display:flex; flex-direction:column; gap:4px;">
                    <div style="display:flex; justify-content:center; align-items:center;">
                        <span style="font-weight:bold;">${data.uploaderName}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; gap:4px; margin-top:4px;">
                        <button class="btn btn-icon btn-admin-view-comments" data-id="${docSnap.id}" style="color:var(--md-sys-color-primary-container); background:rgba(255,255,255,0.2); width:100%; height:32px; border-radius:8px;">
                            <span class="material-symbols-rounded" style="font-size:1.1rem;">chat</span>
                        </button>
                        <button class="btn btn-icon btn-admin-delete-photo" data-id="${docSnap.id}" style="color:#ff4b4b; background:rgba(255,255,255,0.2); width:100%; height:32px; border-radius:8px;">
                            <span class="material-symbols-rounded" style="font-size:1.1rem;">delete</span>
                        </button>
                    </div>
                </div>
            `;

            adminGalleryGrid.appendChild(item);
        });

        if (!hasItems) {
            adminGalleryGrid.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1; text-align:center;">لا توجد صور في هذا التصنيف.</div>';
        }

        // Add listeners for Delete Photo
        document.querySelectorAll('.btn-admin-delete-photo').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const photoId = e.currentTarget.getAttribute('data-id');
                if (confirm('هل أنت متأكد من حذف هذه الصورة نهائياً؟')) {
                    try {
                        await deleteDoc(doc(db, "gallery", photoId));
                    } catch (error) {
                        console.error('Error deleting photo:', error);
                    }
                }
            });
        });

        // Add listeners for View Comments
        document.querySelectorAll('.btn-admin-view-comments').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const photoId = e.currentTarget.getAttribute('data-id');
                openAdminCommentsModal(photoId);
            });
        });
    });
}

function openAdminCommentsModal(photoId) {
    adminCommentsModal.classList.remove('hidden');
    if (adminCommentsUnsubscribe) adminCommentsUnsubscribe();
    
    const q = query(collection(db, `gallery/${photoId}/comments`), orderBy("createdAt", "asc"));
    
    adminCommentsUnsubscribe = onSnapshot(q, (snapshot) => {
        adminCommentsList.innerHTML = '';
        
        if (snapshot.empty) {
            adminCommentsList.innerHTML = '<div style="text-align:center; opacity:0.6; padding: 20px;">لا توجد تعليقات على هذه الصورة.</div>';
            return;
        }
        
        snapshot.forEach((docSnap) => {
            const comment = docSnap.data();
            const div = document.createElement('div');
            div.className = 'comment-item';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';
            div.style.gap = '8px';
            div.style.background = 'rgba(255,255,255,0.7)';
            
            div.innerHTML = `
                <div style="flex:1;">
                    <div class="comment-header">
                        <strong>${comment.userName}</strong>
                        <span>${new Date(comment.createdAt).toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'})}</span>
                    </div>
                    <div>${comment.text}</div>
                </div>
                <button class="btn btn-icon btn-admin-delete-comment" data-photo-id="${photoId}" data-comment-id="${docSnap.id}" style="color:#ff4b4b; background:rgba(255,255,255,0.4); flex-shrink:0;">
                    <span class="material-symbols-rounded">delete</span>
                </button>
            `;
            adminCommentsList.appendChild(div);
        });

        document.querySelectorAll('.btn-admin-delete-comment').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (confirm('حذف التعليق؟')) {
                    const pId = e.currentTarget.getAttribute('data-photo-id');
                    const cId = e.currentTarget.getAttribute('data-comment-id');
                    try {
                        await deleteDoc(doc(db, `gallery/${pId}/comments`, cId));
                    } catch (err) {
                        console.error('Error deleting comment:', err);
                    }
                }
            });
        });
        
        adminCommentsList.scrollTop = adminCommentsList.scrollHeight;
    });
}

// ==============================
// USER MANAGE MODAL (BADGES)
// ==============================
const adminUserModal = document.getElementById('admin-user-modal');
const adminUserModalClose = document.getElementById('admin-user-modal-close');
const adminUserModalName = document.getElementById('admin-user-modal-name');
let currentManagingUserId = null;

if (adminUserModalClose) {
    adminUserModalClose.addEventListener('click', () => {
        adminUserModal.classList.add('hidden');
        currentManagingUserId = null;
    });
}

function openUserManageModal(user) {
    if (!adminUserModal) return;
    currentManagingUserId = user.id;
    adminUserModalName.textContent = `إدارة: ${user.name}`;
    adminUserModal.classList.remove('hidden');
}

document.querySelectorAll('.badge-option').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        if (!currentManagingUserId) return;
        const badge = e.currentTarget.getAttribute('data-badge');
        try {
            await updateDoc(doc(db, "users", currentManagingUserId), {
                badge: badge === 'none' ? null : badge
            });
            adminUserModal.classList.add('hidden');
        } catch (err) {
            console.error('Error updating badge:', err);
            alert('فشل تحديث الوسام.');
        }
    });
});

// ==============================
// TRIVIA MANAGEMENT
// ==============================
const adminTriviaForm = document.getElementById('admin-trivia-form');
const activeTriviaStatus = document.getElementById('active-trivia-status');
const btnCloseTrivia = document.getElementById('btn-close-trivia');

function listenToTrivia() {
    onSnapshot(doc(db, "trivia", "active"), (docSnap) => {
        if (docSnap.exists() && docSnap.data().isActive) {
            const data = docSnap.data();
            if (activeTriviaStatus) {
                activeTriviaStatus.innerHTML = `
                    <div style="color: var(--md-sys-color-primary);">السؤال النشط: ${data.question}</div>
                    <div style="font-size: 0.9rem; color: var(--md-sys-color-secondary);">النقاط: ${data.points}</div>
                    ${data.winnerTeamId ? `<div style="color: var(--md-sys-color-error); margin-top:8px;">تم الإجابة عليه من فرقة: ${teamsCache[data.winnerTeamId]?.name || data.winnerTeamId}</div>` : ''}
                `;
            }
            if (btnCloseTrivia) btnCloseTrivia.classList.remove('hidden');
        } else {
            if (activeTriviaStatus) {
                activeTriviaStatus.innerHTML = `<span style="color: var(--md-sys-color-secondary);">لا يوجد سؤال نشط حالياً.</span>`;
            }
            if (btnCloseTrivia) btnCloseTrivia.classList.add('hidden');
        }
    });
}

if (adminTriviaForm) {
    adminTriviaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const q = document.getElementById('trivia-q').value.trim();
        const opts = [
            document.getElementById('trivia-opt1').value.trim(),
            document.getElementById('trivia-opt2').value.trim(),
            document.getElementById('trivia-opt3').value.trim(),
            document.getElementById('trivia-opt4').value.trim(),
        ];
        const correct = parseInt(document.getElementById('trivia-correct').value);
        const points = parseInt(document.getElementById('trivia-points').value);

        try {
            await setDoc(doc(db, "trivia", "active"), {
                question: q,
                options: opts,
                correctIndex: correct,
                points: points,
                isActive: true,
                winnerTeamId: null,
                createdAt: new Date().toISOString()
            });
            alert('تم نشر السؤال بنجاح!');
            adminTriviaForm.reset();
        } catch (error) {
            console.error(error);
            alert('فشل نشر السؤال');
        }
    });
}

if (btnCloseTrivia) {
    btnCloseTrivia.addEventListener('click', async () => {
        try {
            await updateDoc(doc(db, "trivia", "active"), {
                isActive: false
            });
            alert('تم إغلاق السؤال');
        } catch (error) {
            console.error(error);
        }
    });
}
