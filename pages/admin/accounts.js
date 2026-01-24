// --- Supabase Configuration ---
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';

// Initialize Supabase client
// Initialize Supabase client
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

document.addEventListener('DOMContentLoaded', () => {
    loadAccounts();
});

// --- Fetch Accounts from Supabase ---
async function getAccounts() {
    console.log('Fetching accounts...');
    try {
        const { data, error } = await supabaseClient
            .from('accounts')
            .select('*')
            .order('id', { ascending: false });

        if (error) {
            console.error('Error fetching accounts:', error);
            alert('Database connection error: ' + error.message);
            return [];
        }
        console.log('Accounts fetched:', data);
        return data;
    } catch (err) {
        console.error('Unexpected error:', err);
        return [];
    }
}

// --- Load Accounts into UI ---
async function loadAccounts() {
    const tableBody = document.getElementById('accountsTableBody');
    tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">Loading accounts...</td></tr>';

    const accounts = await getAccounts();
    tableBody.innerHTML = '';

    if (!accounts || accounts.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">No accounts found.</td></tr>';
        return;
    }

    accounts.forEach(acc => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${acc.role}</td>
            <td>${acc.name || 'No Name'}</td>
            <td>${acc.email || '-'}</td>
            <td>${acc.designation !== 'None' ? acc.designation : '-'}</td>
            <td>
                <button class="edit-btn" onclick="openEditUserModal(${acc.id})" style="background:none; border:none; cursor:pointer; color:var(--primary-color);">
                    <span class="material-icons-round">edit</span>
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

// --- Modal Functions ---
function openAddUserModal() {
    document.getElementById('addUserForm').reset();
    document.getElementById('addUserForm').removeAttribute('data-editing-id');
    document.querySelector('.modal-title').textContent = 'Add User';
    document.getElementById('addUserModal').classList.add('active');
}

async function openEditUserModal(id) {
    // In a real app we might fetch just one, but here we can reuse getAccounts or find from DOM
    // For safety, let's fetch the specific user or filter from the current list if we had it stored.
    // Simpler: fetch specific row
    const { data: account, error } = await supabaseClient
        .from('accounts')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error('Error fetching user details:', error);
        return;
    }

    if (account) {
        document.getElementById('userFullName').value = account.name;
        document.getElementById('userEmail').value = account.email;
        document.getElementById('userPassword').value = account.password; // Updated column name in DB
        document.getElementById('userRole').value = account.role;
        document.getElementById('userDesignation').value = account.designation;

        document.getElementById('addUserForm').setAttribute('data-editing-id', id);
        document.querySelector('.modal-title').textContent = 'Edit User';
        document.getElementById('addUserModal').classList.add('active');
    }
}

function closeAddUserModal() {
    document.getElementById('addUserModal').classList.remove('active');
    document.getElementById('addUserForm').reset();
    document.getElementById('addUserForm').removeAttribute('data-editing-id');
}

// --- Save User (Create or Update) ---
async function saveUser(e) {
    e.preventDefault();

    const fullName = document.getElementById('userFullName').value;
    const email = document.getElementById('userEmail').value;
    const password = document.getElementById('userPassword').value;
    const role = document.getElementById('userRole').value;
    const designation = document.getElementById('userDesignation').value;
    const editingId = document.getElementById('addUserForm').getAttribute('data-editing-id');

    const saveBtn = document.querySelector('.btn-save');
    const originalBtnText = saveBtn.textContent;
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;

    try {
        if (editingId) {
            // Update
            const { error } = await supabaseClient
                .from('accounts')
                .update({ name: fullName, email: email, password, role, designation })
                .eq('id', editingId);

            if (error) throw error;
        } else {
            // Insert
            const { error } = await supabaseClient
                .from('accounts')
                .insert([{ name: fullName, email: email, password, role, designation }]);

            if (error) throw error;
        }

        closeAddUserModal();
        loadAccounts(); // Refresh list

    } catch (err) {
        alert('Error saving account: ' + err.message);
        console.error(err);
    } finally {
        saveBtn.textContent = originalBtnText;
        saveBtn.disabled = false;
    }
}

// Close modal if clicked outside
document.getElementById('addUserModal').addEventListener('click', (e) => {
    if (e.target.id === 'addUserModal') {
        closeAddUserModal();
    }
});

// --- Logout Function ---
function logout() {
    // Clear any stored login state (if any)
    localStorage.removeItem('loginUser');

    // Redirect to login page
    window.location.href = '../../index.html';
}

