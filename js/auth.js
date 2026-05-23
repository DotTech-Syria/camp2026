import { auth, db, googleProvider } from './firebase-config.js';
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// DOM Elements
const loginSection = document.getElementById('login-section');
const appMain = document.getElementById('app-main');
const adminLoginSection = document.getElementById('admin-login-section');
const adminDashboard = document.getElementById('admin-dashboard');

const googleLoginBtn = document.getElementById('google-login-btn');
const adminGoogleLoginBtn = document.getElementById('admin-google-login-btn');
const emailLoginForm = document.getElementById('email-login-form');
const emailRegisterForm = document.getElementById('email-register-form');
const showRegisterLink = document.getElementById('show-register-link');
const showLoginLink = document.getElementById('show-login-link');
const logoutBtn = document.getElementById('logout-btn');
const adminLogoutBtn = document.getElementById('admin-logout-btn');

// State
export let currentUser = null;
export let userRole = null; // 'member' or 'admin'
export let userTeam = null;
export let userBadge = null;
export let currentUserName = '';

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
            userBadge = data.badge || null;
            currentUserName = data.name || user.displayName || user.email.split('@')[0];
            
            handleNavigationByRole();
        } else {
            // First time login - show profile completion modal
            const modal = document.getElementById('complete-profile-modal');
            if (modal) {
                // If it's an admin page, we can just save it automatically or they can't complete the modal.
                // It's better to hide the login section and show the modal if on index.html
                if (isAdminPage) {
                    const newUser = {
                        name: user.displayName || user.email.split('@')[0],
                        email: user.email,
                        role: 'member',
                        teamId: null,
                        createdAt: new Date().toISOString()
                    };
                    await setDoc(userRef, newUser);
                    userRole = 'member';
                    handleNavigationByRole();
                } else {
                    loginSection.classList.add('hidden');
                    modal.classList.remove('hidden');
                }
            }
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

    if (nameEl) {
        nameEl.innerHTML = currentUserName + (userBadge ? ` <span style="font-size:1.1rem; margin-right:4px;">${userBadge}</span>` : '');
    }
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

if (showRegisterLink && showLoginLink) {
    showRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        emailLoginForm.classList.add('hidden');
        emailRegisterForm.classList.remove('hidden');
    });

    showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        emailRegisterForm.classList.add('hidden');
        emailLoginForm.classList.remove('hidden');
    });
}

if (emailRegisterForm) {
    emailRegisterForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('register-name').value.trim();
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(userCredential.user, { displayName: name });
            
            const userRef = doc(db, 'users', userCredential.user.uid);
            await setDoc(userRef, {
                name: name,
                email: email,
                role: 'member',
                teamId: null,
                createdAt: new Date().toISOString()
            });
            
            // Hide the complete profile modal if it accidentally appeared due to the listener race condition
            const modal = document.getElementById('complete-profile-modal');
            if (modal) modal.classList.add('hidden');
            
            // Re-fetch user data to navigate to the app
            await fetchUserData(userCredential.user);
            
        } catch (error) {
            console.error("Registration Error:", error);
            if(error.code === 'auth/email-already-in-use') {
                alert("هذا البريد الإلكتروني مستخدم بالفعل.");
            } else {
                alert("فشل إنشاء الحساب: " + error.message);
            }
        }
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

// Profile Completion Listener
const profileForm = document.getElementById('complete-profile-form');
if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fName = document.getElementById('profile-first-name').value.trim();
        const lName = document.getElementById('profile-last-name').value.trim();
        
        if (!fName || !lName) return;

        const fullName = `${fName} ${lName}`;
        
        try {
            const userRef = doc(db, 'users', currentUser.uid);
            const newUser = {
                name: fullName,
                email: currentUser.email,
                role: 'member',
                teamId: null,
                createdAt: new Date().toISOString()
            };
            
            // Re-update currentUser locally so UI shows it right away
            currentUserName = fullName;
            
            await setDoc(userRef, newUser);
            userRole = 'member';
            
            document.getElementById('complete-profile-modal').classList.add('hidden');
            updateUserProfileUI();
            handleNavigationByRole();
        } catch (error) {
            console.error("Error saving profile:", error);
            alert("حدث خطأ أثناء حفظ البيانات");
        }
    });
}
