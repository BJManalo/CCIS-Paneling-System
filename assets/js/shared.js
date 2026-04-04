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
// Register Service Worker with robust path detection
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Determine the correct path to sw.js based on current location
        const isInPages = window.location.pathname.includes('/pages/');
        const swPath = isInPages ? '../../sw.js' : 'sw.js';
        
        navigator.serviceWorker.register(swPath)
            .then(reg => {
                console.log('PWA: Service Worker registered correctly.');
                reg.update();
            })
            .catch(err => console.error('PWA: Service Worker registration failed:', err));
    });
}
