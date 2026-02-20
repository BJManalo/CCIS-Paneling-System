// panel_accounts.js

// --- Supabase Configuration ---
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

let currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
    const userJson = localStorage.getItem('loginUser');
    const user = userJson ? JSON.parse(userJson) : null;
    const rawRole = (user && user.role) ? user.role.toString().toLowerCase() : '';
    const isAdviser = rawRole.includes('adviser') || rawRole.includes('advisor');
    const hasOtherRole = rawRole.includes('instructor') || rawRole.includes('panel') || rawRole.includes('admin');

    // Aggressive Eval Hide for Adviser-only
    if (isAdviser && !hasOtherRole) {
        document.querySelectorAll('.nav-item, a').forEach(nav => {
            const href = (nav.getAttribute('href') || '').toLowerCase();
            const text = (nav.textContent || '').toLowerCase();
            if (href.includes('evaluation') || text.includes('evaluation')) {
                nav.style.setProperty('display', 'none', 'important');
            }
        });
    }

    loadUserProfile();
});

function loadUserProfile() {
    const userJson = localStorage.getItem('loginUser');
    if (!userJson) {
        window.location.href = '../../';
        return;
    }
    currentUser = JSON.parse(userJson);

    // Populate Table
    const tableBody = document.getElementById('accountTableBody');
    tableBody.innerHTML = `
        <tr>
            <td>${currentUser.name || 'No Name Set'}</td>
            <td>${currentUser.email || 'No Email Set'}</td>
            <td><span class="status-badge" style="background: var(--primary-light); color: var(--primary-dark); font-weight: 600;">${(currentUser.role || 'User').toUpperCase()}</span></td>
            <td>${currentUser.designation || 'Not Specified'}</td>
            <td style="text-align: center;">
                <button class="action-btn edit" onclick="openEditModal()">
                    <span class="material-icons-round">edit</span>
                </button>
            </td>
        </tr>
    `;
}

function openEditModal() {
    document.getElementById('editFullName').value = currentUser.name || '';
    document.getElementById('editPassword').value = '';
    document.getElementById('editAccountModal').classList.add('active');
}

function closeEditModal() {
    document.getElementById('editAccountModal').classList.remove('active');
}

function togglePassVisibility() {
    const passInput = document.getElementById('editPassword');
    const toggleIcon = document.getElementById('passToggle');

    if (passInput.type === 'password') {
        passInput.type = 'text';
        toggleIcon.textContent = 'visibility_off';
    } else {
        passInput.type = 'password';
        toggleIcon.textContent = 'visibility';
    }
}

async function saveAccountChanges(e) {
    e.preventDefault();

    const newName = document.getElementById('editFullName').value;
    const newPassword = document.getElementById('editPassword').value;

    const updateData = { name: newName };
    if (newPassword.trim() !== '') {
        updateData.password = newPassword;
    }

    try {
        const { data, error } = await supabaseClient
            .from('accounts')
            .update(updateData)
            .eq('id', currentUser.id)
            .select()
            .single();

        if (error) throw error;

        // Update Local Storage
        localStorage.setItem('loginUser', JSON.stringify(data));
        currentUser = data;

        // Update UI
        loadUserProfile();
        closeEditModal();
        showToast('Account updated successfully!');

    } catch (err) {
        alert('Error updating profile: ' + err.message);
    }
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-feedback';
    toast.innerHTML = `
        <span class="material-icons-round">check_circle</span>
        <span>${message}</span>
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('show');
    }, 100);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../';
}

