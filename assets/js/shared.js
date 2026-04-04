const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
const supabaseClient = window.supabase?.createClient(PROJECT_URL, PUBLIC_KEY);

// Toggle password visibility function needs to be global
window.togglePasswordVisibility = function () {
    const passwordInput = document.getElementById('password');
    const toggleIcon = document.querySelector('.toggle-password');

    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleIcon.textContent = 'visibility_off';
    } else {
        passwordInput.type = 'password';
        toggleIcon.textContent = 'visibility';
    }
}

// Generic Toggle Function
window.toggleGenericPassword = function (inputId, iconElement) {
    const passwordInput = document.getElementById(inputId);
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        iconElement.textContent = 'visibility'; // Show eye (open)
    } else {
        passwordInput.type = 'password';
        iconElement.textContent = 'visibility_off'; // Hide eye (closed)
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');

    // Only proceed with login logic if loginForm exists (on index.html)
    if (loginForm) {
        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        const loginBtn = document.querySelector('.login-btn');

        // Add simple entrance animation
        const elements = [usernameInput.parentElement, passwordInput.parentElement, document.querySelector('.form-actions'), loginBtn];
        elements.forEach((el, index) => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(20px)';
            el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            el.style.transitionDelay = `${index * 100}ms`;

            setTimeout(() => {
                el.style.opacity = '1';
                el.style.transform = 'translateY(0)';
            }, 100);
        });

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const identifier = usernameInput.value;
            const password = passwordInput.value;

            if (!identifier || !password) {
                showErrorModal('Please fill in all fields.');
                return;
            }

            // --- Log In Process ---
            const originalBtnText = loginBtn.innerHTML;
            loginBtn.innerHTML = '<span>Logging in...</span>';
            loginBtn.style.opacity = '0.8';
            loginBtn.disabled = true;

            try {
                if (!supabaseClient) {
                    throw new Error("Supabase client not initialized. Check internet or ad blockers.");
                }

                // In a real production app, use supabase.auth.signInWithPassword()
                // Here we are manually checking against our 'accounts' table as requested
                // First try 'accounts' table (Admin, Instructor, Panel, Adviser)
                // Allow login via Email OR Name
                let { data: accountData, error: accountError } = await supabaseClient
                    .from('accounts')
                    .select('*')
                    .or(`email.eq."${identifier}",name.eq."${identifier}"`)
                    .eq('password', password)
                    .maybeSingle(); // Use maybeSingle to avoid 406 error if not found

                if (accountData) {
                    // Found in accounts table
                    localStorage.setItem('loginUser', JSON.stringify(accountData));

                    if (accountData.role === 'Admin') {
                        window.location.href = 'pages/admin/admin';
                    } else if (accountData.role === 'Instructor' || accountData.role === 'Instructor/Adviser') {
                        window.location.href = 'pages/instructor/instructor_dashboard';
                    } else if (accountData.role === 'Panel' || accountData.role === 'Adviser') {
                        window.location.href = 'pages/panel/panel_capstone';
                    } else {
                        window.location.href = 'pages/panel/panel_capstone';
                    }
                    return;
                }

                // If not found in accounts, try 'student_groups' table
                // Allow login via Email OR Group Name
                let { data: groupData, error: groupError } = await supabaseClient
                    .from('student_groups')
                    .select('*')
                    .or(`email.eq."${identifier}",group_name.eq."${identifier}"`)
                    .eq('password', password)
                    .maybeSingle();

                if (groupData) {
                    // Found in student_groups table
                    // Add a pseudo-role for local logic if needed
                    groupData.role = 'StudentGroup';
                    localStorage.setItem('loginUser', JSON.stringify(groupData));
                    window.location.href = 'pages/student/student_dashboard';
                    return;
                }

                // If neither found
                showErrorModal('Invalid Credentials. Please check your username/email or password and try again.');
                loginBtn.innerHTML = originalBtnText;
                loginBtn.style.opacity = '1';
                loginBtn.disabled = false;

            } catch (err) {
                console.error('Login error:', err);
                showErrorModal('Login failed: ' + err.message);
                loginBtn.innerHTML = originalBtnText;
                loginBtn.style.opacity = '1';
                loginBtn.disabled = false;
            }
        });
    }
});

// Custom Error Modal Function
window.showErrorModal = function (message) {
    // Remove existing modal if any
    const existing = document.querySelector('.custom-modal-overlay');
    if (existing) existing.remove();

    // Create Modal HTML
    const modalHtml = `
        <div class="custom-modal-overlay">
            <div class="custom-modal">
                <div class="modal-icon">
                    <span class="material-icons-round">error_outline</span>
                </div>
                <h3 class="modal-title">Access Denied</h3>
                <p class="modal-message">${message}</p>
                <button class="modal-btn" onclick="document.querySelector('.custom-modal-overlay').remove()">Try Again</button>
            </div>
        </div>
    `;

    // Append to body
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

/* ---------------------------------------------------
    PWA INSTALLATION LOGIC
--------------------------------------------------- */
let deferredPrompt;

// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registered.'))
            .catch(err => console.log('Service Worker registration failed: ', err));
    });
}

// Handle 'beforeinstallprompt' to show a custom install popup
window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    
    // Check if the user is logged in before showing the prompt
    // This assumes that on dashboard pages, 'loginUser' exists in localStorage
    const isLoggedIn = localStorage.getItem('loginUser');
    
    if (isLoggedIn) {
        // Show the custom install popup after a short delay for better UX
        setTimeout(() => {
            showInstallPrompt();
        }, 2000); // 2 second delay after login/landing on dashboard
    }
});

function showInstallPrompt() {
    // Only show if not already showing
    if (document.getElementById('pwa-install-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.style.cssText = `
        position: fixed;
        bottom: 25px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(10px);
        padding: 16px 24px;
        border-radius: 20px;
        box-shadow: 0 15px 35px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        gap: 15px;
        z-index: 10000;
        width: 90%;
        max-width: 400px;
        border: 1px solid rgba(224, 161, 46, 0.2);
        animation: slideUp 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    `;

    banner.innerHTML = `
        <div style="background: var(--primary-color); width: 45px; height: 45px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white;">
            <span class="material-icons-round">install_mobile</span>
        </div>
        <div style="flex: 1;">
            <h4 style="margin: 0; color: #333; font-size: 15px;">Install App</h4>
            <p style="margin: 0; color: #666; font-size: 12px;">Add to home screen for better experience</p>
        </div>
        <button id="pwa-install-btn" style="background: var(--primary-color); color: white; border: none; padding: 8px 16px; border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 13px;">Install</button>
        <span id="pwa-close-banner" class="material-icons-round" style="cursor: pointer; color: #999; font-size: 20px;">close</span>
    `;

    document.body.appendChild(banner);

    const installBtn = document.getElementById('pwa-install-btn');
    const closeBtn = document.getElementById('pwa-close-banner');

    installBtn.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User response to the install prompt: ${outcome}`);
            deferredPrompt = null;
            banner.remove();
        }
    });

    closeBtn.addEventListener('click', () => {
        banner.remove();
    });
}

// Add animation keyframe if not present
if (!document.getElementById('pwa-styles')) {
    const style = document.createElement('style');
    style.id = 'pwa-styles';
    style.innerHTML = `
        @keyframes slideUp {
            from { transform: translate(-50%, 100px); opacity: 0; }
            to { transform: translate(-50%, 0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
}
