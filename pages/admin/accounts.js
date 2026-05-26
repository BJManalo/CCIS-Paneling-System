// --- Supabase Configuration ---
var PROJECT_URL = PROJECT_URL || 'https://oddzwiddvniejcawzpwi.supabase.co';
var PUBLIC_KEY = PUBLIC_KEY || 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';

// Initialize Supabase client
// Initialize Supabase client
var supabaseClient = supabaseClient || window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

// State
let allAccounts = [];
let filteredAccounts = [];
let currentPage = 1;
const rowsPerPage = 15;
document.addEventListener('DOMContentLoaded', () => {
    loadAccounts();
    setupSearch();
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

    allAccounts = await getAccounts();
    filteredAccounts = [...allAccounts];
    renderAccounts();
}

function renderAccounts() {
    const accounts = filteredAccounts;
    const tableBody = document.getElementById('accountsTableBody');
    tableBody.innerHTML = '';

    // --- Pagination Logic ---
    const totalPages = Math.ceil(accounts.length / rowsPerPage);
    if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * rowsPerPage;
    const paginatedAccounts = accounts.slice(startIndex, startIndex + rowsPerPage);

    if (!paginatedAccounts || paginatedAccounts.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">No accounts found.</td></tr>';
        updatePaginationUI(totalPages);
        return;
    }

    paginatedAccounts.forEach(acc => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><span class="status-badge" style="background:#f1f5f9; color:#475569; border:1px solid #e2e8f0;">${acc.role}</span></td>
            <td style="font-weight: 600;">${acc.name || 'No Name'}</td>
            <td>${acc.email || '-'}</td>
            <td>${acc.designation !== 'None' ? acc.designation : '-'}</td>
            <td>
                <div style="display: flex; justify-content: center; gap: 10px;">
                    <button class="edit-btn" onclick="openEditUserModal(${acc.id})" style="background:none; border:none; cursor:pointer; color:var(--primary-color);" title="Edit">
                        <span class="material-icons-round">edit</span>
                    </button>
                    <button class="delete-btn" onclick="deleteAccount(${acc.id})" style="background:none; border:none; cursor:pointer; color:#ef4444;" title="Delete">
                        <span class="material-icons-round">delete</span>
                    </button>
                </div>
            </td>
        `;
        tableBody.appendChild(row);
    });

    updatePaginationUI(totalPages);
}

function updatePaginationUI(totalPages) {
    let paginationContainer = document.querySelector('.pagination');
    if (!paginationContainer) {
        // Create if it doesn't exist
        const tableContainer = document.querySelector('.table-container');
        if (tableContainer) {
            paginationContainer = document.createElement('div');
            paginationContainer.className = 'pagination';
            paginationContainer.style.justifyContent = 'flex-end';
            tableContainer.after(paginationContainer);
        } else {
            return;
        }
    }

    if (totalPages <= 1) {
        paginationContainer.style.display = 'none';
        return;
    }

    paginationContainer.style.display = 'flex';
    
    paginationContainer.innerHTML = `
        <button class="page-btn prev" ${currentPage === 1 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : `onclick="changePage(${currentPage - 1})"`}>Previous</button>
        <span class="page-number active">${currentPage}</span>
        <button class="page-btn next" ${currentPage === totalPages ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : `onclick="changePage(${currentPage + 1})"`}>Next</button>
    `;
}

window.changePage = (newPage) => {
    currentPage = newPage;
    renderAccounts();
};

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        filteredAccounts = allAccounts.filter(acc =>
            (acc.name || '').toLowerCase().includes(term) ||
            (acc.email || '').toLowerCase().includes(term) ||
            (acc.role || '').toLowerCase().includes(term)
        );
        currentPage = 1;
        renderAccounts();
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

// --- Delete User Modal Logic ---
let accountIdToDelete = null;

function deleteAccount(id) {
    accountIdToDelete = id;
    document.getElementById('deleteConfirmModal').classList.add('active');
}

function closeDeleteConfirmModal() {
    accountIdToDelete = null;
    document.getElementById('deleteConfirmModal').classList.remove('active');
}

async function confirmDeleteAccount() {
    if (!accountIdToDelete) return;

    const btn = document.getElementById('confirmDeleteBtn');
    const originalText = btn.textContent;
    btn.textContent = 'Deleting...';
    btn.disabled = true;

    try {
        const { error } = await supabaseClient
            .from('accounts')
            .delete()
            .eq('id', accountIdToDelete);

        if (error) throw error;

        closeDeleteConfirmModal();
        loadAccounts(); // Refresh list
    } catch (err) {
        alert('Error deleting account: ' + err.message);
        console.error(err);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// Close modals if clicked outside
document.getElementById('addUserModal').addEventListener('click', (e) => {
    if (e.target.id === 'addUserModal') {
        closeAddUserModal();
    }
});

document.getElementById('deleteConfirmModal').addEventListener('click', (e) => {
    if (e.target.id === 'deleteConfirmModal') {
        closeDeleteConfirmModal();
    }
});

// --- Logout Function ---
function logout() {
    // Clear any stored login state (if any)
    localStorage.removeItem('loginUser');

    // Redirect to login page
    window.location.href = '../../';
}

// --- Helper: Toggle Password Visibility ---
window.toggleGenericPassword = (inputId, iconElement) => {
    const input = document.getElementById(inputId);
    if (!input) return;

    if (input.type === 'password') {
        input.type = 'text';
        iconElement.innerText = 'visibility'; // Show icon
        iconElement.style.color = '#2563eb'; // Active color
    } else {
        input.type = 'password';
        iconElement.innerText = 'visibility_off'; // Hide icon
        iconElement.style.color = '#64748b'; // Inactive color
    }
};
