import { auth, db, googleProvider } from './firebase-config.js';
import { signInWithPopup, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// DOM Elements
const loginSection = document.getElementById('login-section');
const appMain = document.getElementById('app-main');
const adminLoginSection = document.getElementById('admin-login-section');
const adminDashboard = document.getElementById('admin-dashboard');

const googleLoginBtn = document.getElementById('google-login-btn');
const adminGoogleLoginBtn = document.getElementById('admin-google-login-btn');
const emailLoginForm = document.getElementById('email-login-form');
const logoutBtn = document.getElementById('logout-btn');
const adminLogoutBtn = document.getElementById('admin-logout-btn');

// State
export let currentUser = null;
export let userRole = null; // 'member' or 'admin'
export let userTeam = null;

// Determine if we are on the admin page
const isAdminPage = window.location.pathname.includes('admin.html');

// Authentication State Observer
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // User is signed in
        currentUser = user;
        await fetchUserData(user);
    } else {
        // User is signed out
        currentUser = null;
        userRole = null;
        userTeam = null;
        showLogin();
    }
});

async function fetchUserData(user) {
    try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            const data = userSnap.data();
            userRole = data.role || 'member';
            userTeam = data.teamId || null;
            
            handleNavigationByRole();
        } else {
            // First time login - create user document
            const newUser = {
                name: user.displayName || user.email.split('@')[0],
                email: user.email,
                role: 'member', // default role
                teamId: null,
                createdAt: new Date().toISOString()
            };
            await setDoc(userRef, newUser);
            userRole = 'member';
            handleNavigationByRole();
        }
    } catch (error) {
        console.error("Error fetching user data:", error);
        alert("حدث خطأ أثناء جلب بيانات المستخدم");
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
        adminLoginSection.classList.remove('hidden');
        adminDashboard.classList.add('hidden');
    } else {
        loginSection.classList.remove('hidden');
        appMain.classList.add('hidden');
    }
}

function showAppMain() {
    loginSection.classList.add('hidden');
    appMain.classList.remove('hidden');
}

function showAdminDashboard() {
    adminLoginSection.classList.add('hidden');
    adminDashboard.classList.remove('hidden');
    // Dispatch event for admin.js
    window.dispatchEvent(new CustomEvent('adminAuthReady'));
}

function updateUserProfileUI() {
    const nameEl = document.getElementById('user-name');
    const teamEl = document.getElementById('user-team');
    const picEl = document.getElementById('user-profile-pic');

    if (nameEl) nameEl.textContent = currentUser.displayName || currentUser.email.split('@')[0];
    if (picEl && currentUser.photoURL) picEl.src = currentUser.photoURL;
    
    // Team name will be updated by app.js after fetching teams
}

// Event Listeners
if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', () => {
        signInWithPopup(auth, googleProvider).catch(error => {
            console.error("Google Login Error:", error);
            alert("فشل تسجيل الدخول بـ Google");
        });
    });
}

if (adminGoogleLoginBtn) {
    adminGoogleLoginBtn.addEventListener('click', () => {
        signInWithPopup(auth, googleProvider).catch(error => {
            console.error("Admin Google Login Error:", error);
            alert("فشل تسجيل الدخول");
        });
    });
}

if (emailLoginForm) {
    emailLoginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        
        signInWithEmailAndPassword(auth, email, password).catch(error => {
            console.error("Email Login Error:", error);
            alert("فشل تسجيل الدخول. تأكد من البريد وكلمة المرور.");
        });
    });
}

async function doLogout() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Logout Error:", error);
    }
}

if (logoutBtn) logoutBtn.addEventListener('click', doLogout);
if (adminLogoutBtn) adminLogoutBtn.addEventListener('click', doLogout);
