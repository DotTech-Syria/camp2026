import { db } from './firebase-config.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// DOM Elements
const loginSection = document.getElementById('login-section');
const appMain = document.getElementById('app-main');
const adminLoginSection = document.getElementById('admin-login-section');
const adminDashboard = document.getElementById('admin-dashboard');

const newUserForm = document.getElementById('new-user-form');
const returningUserForm = document.getElementById('returning-user-form');
const showRegisterLink = document.getElementById('show-register-link');
const showLoginLink = document.getElementById('show-login-link');
const logoutBtn = document.getElementById('logout-btn');
const adminLogoutBtn = document.getElementById('admin-logout-btn');

const idDisplayModal = document.getElementById('id-display-modal');
const displayCustomId = document.getElementById('display-custom-id');
const btnCloseIdModal = document.getElementById('btn-close-id-modal');

// State
export let currentUser = null;
export let userRole = null; // 'member' or 'admin'
export let userTeam = null;
export let userBadge = null;
export let currentUserName = '';

// Determine if we are on the admin page
const isAdminPage = window.location.pathname.includes('admin.html');

// Helper to generate a random 6-character alphanumeric ID
function generateCustomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluded confusing chars like I, O, 1, 0
    let id = '';
    for (let i = 0; i < 6; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

// Check local storage for existing session
async function checkLocalAuth() {
    const localId = localStorage.getItem('camp-user-id');
    if (localId) {
        await fetchUserData(localId);
    } else {
        showLogin();
    }
}

async function fetchUserData(userId) {
    try {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            const data = userSnap.data();
            
            currentUser = { uid: userId, ...data };
            userRole = data.role || 'member';
            userTeam = data.teamId || null;
            userBadge = data.badge || null;
            currentUserName = data.name;
            
            // Save to local storage (in case it's a fresh login)
            localStorage.setItem('camp-user-id', userId);
            // Save stringified version for easy synchronous access by other files if needed
            localStorage.setItem('camp-user', JSON.stringify({ uid: userId, name: currentUserName, role: userRole }));
            
            handleNavigationByRole();
        } else {
            // ID invalid or deleted
            doLogout();
        }
    } catch (error) {
        console.error("Error fetching user data:", error);
        alert("حدث خطأ أثناء جلب بيانات المستخدم. تحقق من الاتصال بالانترنت.");
        showLogin();
    }
}

function handleNavigationByRole() {
    if (isAdminPage) {
        if (userRole === 'admin') {
            showAdminDashboard();
        } else {
            alert("عذراً، لا تملك صلاحيات الإدارة.");
            doLogout();
        }
    } else {
        showAppMain();
        updateUserProfileUI();
        // Dispatch custom event to let app.js know data is ready
        window.dispatchEvent(new CustomEvent('authReady'));
    }
}

function showLogin() {
    if (isAdminPage) {
        if (adminLoginSection) adminLoginSection.classList.remove('hidden');
        if (adminDashboard) adminDashboard.classList.add('hidden');
    } else {
        if (loginSection) loginSection.classList.remove('hidden');
        if (appMain) appMain.classList.add('hidden');
    }
}

function showAppMain() {
    if (loginSection) loginSection.classList.add('hidden');
    if (appMain) appMain.classList.remove('hidden');
}

function showAdminDashboard() {
    if (adminLoginSection) adminLoginSection.classList.add('hidden');
    if (adminDashboard) adminDashboard.classList.remove('hidden');
    // Dispatch event for admin.js
    window.dispatchEvent(new CustomEvent('adminAuthReady'));
}

function updateUserProfileUI() {
    const nameEl = document.getElementById('user-name');
    const teamEl = document.getElementById('user-team');
    const picEl = document.getElementById('user-profile-pic');

    if (nameEl) {
        nameEl.innerHTML = currentUserName + (userBadge ? ` <span style="font-size:1.1rem; margin-right:4px;">${userBadge}</span>` : '');
    }
    // Set user profile picture using DiceBear notionists-neutral
    if (picEl) {
        if (currentUser && currentUser.photoURL) {
            picEl.src = currentUser.photoURL;
        } else {
            const colors = ['74f8e5', 'cce8e2', 'cde5ff', 'ffdcc0', 'ffb4ab', 'e2e2e2', 'd0e4ff', 'b6e3f4', 'ffd1dc', 'e8e0d5'];
            const charSum = [...currentUserName].reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const chosenColor = colors[charSum % colors.length];
            picEl.src = `https://api.dicebear.com/9.x/notionists-neutral/svg?seed=${encodeURIComponent(currentUserName)}&backgroundColor=${chosenColor}`;
        }
        
        // Show user ID display modal when clicking on profile picture
        picEl.style.cursor = 'pointer';
        picEl.title = 'عرض الكود التعريفي (ID) الخاص بي';
        picEl.onclick = () => {
            if (currentUser && currentUser.uid) {
                if (idDisplayModal) {
                    const titleEl = idDisplayModal.querySelector('h2');
                    if (titleEl) titleEl.textContent = 'الكود التعريفي الخاص بك';
                    const descEl = idDisplayModal.querySelector('p');
                    if (descEl) descEl.innerHTML = 'هذا هو الكود التعريفي (ID) الخاص بحسابك. يمكنك استخدامه لتسجيل الدخول مجدداً في حال مسح ذاكرة التخزين:';
                    if (displayCustomId) displayCustomId.textContent = currentUser.uid;
                    idDisplayModal.classList.remove('hidden');
                }
            }
        };
    }
    
    // Team name will be updated by app.js after fetching teams
}

// Event Listeners for Login Forms (index.html)
if (showRegisterLink && showLoginLink) {
    showRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        returningUserForm.classList.add('hidden');
        newUserForm.classList.remove('hidden');
    });

    showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        newUserForm.classList.add('hidden');
        returningUserForm.classList.remove('hidden');
    });
}

// Register New User
if (newUserForm) {
    newUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fName = document.getElementById('register-first-name').value.trim();
        const lName = document.getElementById('register-last-name').value.trim();
        
        if (!fName || !lName) return;

        const fullName = `${fName} ${lName}`;
        const newId = generateCustomId();
        const submitBtn = newUserForm.querySelector('button[type="submit"]');
        
        submitBtn.disabled = true;
        submitBtn.textContent = 'جاري التسجيل...';

        try {
            const colors = ['74f8e5', 'cce8e2', 'cde5ff', 'ffdcc0', 'ffb4ab', 'e2e2e2', 'd0e4ff', 'b6e3f4', 'ffd1dc', 'e8e0d5'];
            const randomColor = colors[Math.floor(Math.random() * colors.length)];
            const randomSeed = Math.random().toString(36).substring(2, 9);
            const avatarUrl = `https://api.dicebear.com/9.x/notionists-neutral/svg?seed=${randomSeed}&backgroundColor=${randomColor}`;
            const userRef = doc(db, 'users', newId);
            await setDoc(userRef, {
                name: fullName,
                role: 'member',
                teamId: null,
                photoURL: avatarUrl,
                createdAt: new Date().toISOString()
            });

            // Show ID Display Modal with registration specific text
            if (idDisplayModal) {
                const titleEl = idDisplayModal.querySelector('h2');
                if (titleEl) titleEl.textContent = 'تم التسجيل بنجاح!';
                const descEl = idDisplayModal.querySelector('p');
                if (descEl) descEl.innerHTML = 'هذا هو الكود التعريفي الخاص بك. يرجى <strong>حفظه أو التقاط صورة للشاشة</strong> للتمكن من الدخول لاحقاً:';
                if (displayCustomId) displayCustomId.textContent = newId;
                idDisplayModal.classList.remove('hidden');
            }
            
            // Log them in behind the scenes
            await fetchUserData(newId);
        } catch (error) {
            console.error("Registration Error:", error);
            alert("فشل إنشاء الحساب: " + error.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'دخول لأول مرة';
        }
    });
}

// Close ID Modal
if (btnCloseIdModal) {
    btnCloseIdModal.addEventListener('click', () => {
        idDisplayModal.classList.add('hidden');
    });
}

// Login Returning User
if (returningUserForm) {
    returningUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const customId = document.getElementById('login-custom-id').value.trim().toUpperCase();
        if (!customId) return;

        const submitBtn = returningUserForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'جاري الدخول...';

        try {
            const userRef = doc(db, 'users', customId);
            const userSnap = await getDoc(userRef);
            
            if (userSnap.exists()) {
                await fetchUserData(customId);
            } else {
                alert("الكود التعريفي غير صحيح أو غير موجود.");
            }
        } catch (error) {
            console.error("Login Error:", error);
            alert("حدث خطأ أثناء تسجيل الدخول.");
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'دخول';
        }
    });
}

// Admin Login Form
const adminLoginForm = document.getElementById('admin-login-form');
if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const customId = document.getElementById('admin-custom-id').value.trim().toUpperCase();
        if (!customId) return;

        const submitBtn = adminLoginForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'جاري الدخول...';

        try {
            const userRef = doc(db, 'users', customId);
            const userSnap = await getDoc(userRef);
            
            if (userSnap.exists()) {
                if(userSnap.data().role === 'admin') {
                    await fetchUserData(customId);
                } else {
                    alert("هذا الكود لا يملك صلاحيات الإدارة.");
                }
            } else {
                alert("الكود التعريفي غير صحيح أو غير موجود.");
            }
        } catch (error) {
            console.error("Login Error:", error);
            alert("حدث خطأ أثناء تسجيل الدخول.");
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'دخول كمسؤول';
        }
    });
}

// Logout
function doLogout() {
    currentUser = null;
    userRole = null;
    userTeam = null;
    currentUserName = '';
    localStorage.removeItem('camp-user-id');
    localStorage.removeItem('camp-user');
    showLogin();
    // Refresh page to clear memory state
    window.location.reload();
}

if (logoutBtn) logoutBtn.addEventListener('click', doLogout);
if (adminLogoutBtn) adminLogoutBtn.addEventListener('click', doLogout);

// Initialize Authentication
window.addEventListener('load', () => {
    checkLocalAuth();
});
