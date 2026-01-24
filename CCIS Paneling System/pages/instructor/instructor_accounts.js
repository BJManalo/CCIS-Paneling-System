// instructor_accounts.js

// --- Supabase Configuration ---
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';

// Initialize Supabase client
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

let allGroups = [];

document.addEventListener('DOMContentLoaded', () => {
    loadGroups();
});

// --- Fetch Groups from Supabase ---
async function getGroups() {
    console.log('Fetching groups...');
    try {
        const { data: groups, error: groupsError } = await supabaseClient
            .from('student_groups')
            .select('*')
            .order('id', { ascending: false });

        if (groupsError) throw groupsError;

        // Fetch all students to map to groups
        const { data: students, error: studentsError } = await supabaseClient
            .from('students')
            .select('*');

        if (studentsError) throw studentsError;

        // Attach members to each group
        return groups.map(group => {
            const members = students.filter(s => s.group_id === group.id);
            return { ...group, members };
        });

    } catch (err) {
        console.error('Unexpected error:', err);
        return [];
    }
}

// --- Load Groups into UI ---
async function loadGroups() {
    const tableBody = document.getElementById('groupsTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">Loading groups...</td></tr>';

    const groups = await getGroups();
    allGroups = groups;
    renderGroups(groups);
}

function renderGroups(groups) {
    const tableBody = document.getElementById('groupsTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    if (!groups || groups.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">No student groups found.</td></tr>';
        return;
    }

    groups.forEach(group => {
        const memberNames = group.members.map(m => m.full_name).join(', ');

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><span style="font-weight:600; color:var(--primary-color);">${group.group_name}</span></td>
            <td>${group.program}</td>
            <td>${group.year_level}</td>
            <td>${group.section}</td>
            <td>${group.adviser}</td>
            <td><span style="font-size: 0.9em; line-height: 1.4;">${memberNames || 'None'}</span></td>
            <td>
                <div style="display: flex; gap: 8px;">
                    <button class="edit-btn" onclick="openEditGroupModal('${group.id}')" title="Edit Group Details" style="background:none; border:none; cursor:pointer; color:var(--primary-color);">
                        <span class="material-icons-round" style="font-size: 20px;">edit</span>
                    </button>
                </div>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

// --- Group Actions ---
async function openAddGroupModal() {
    document.getElementById('editGroupForm').reset();
    document.getElementById('editGroupForm').removeAttribute('data-editing-id');
    document.querySelector('.modal-title').textContent = 'Add Group';

    // Explicitly clear member ID storage
    for (let i = 1; i <= 5; i++) {
        document.getElementById(`memberEdit${i}`).removeAttribute('data-student-id');
    }

    document.getElementById('emailEdit').value = '';
    document.getElementById('passwordEdit').value = '';

    document.getElementById('editGroupModal').classList.add('active');
}

async function openEditGroupModal(groupId) {
    const group = allGroups.find(g => g.id == groupId);
    if (!group) return;

    document.getElementById('groupNameEdit').value = group.group_name;
    document.getElementById('programEdit').value = group.program;
    document.getElementById('yearEdit').value = group.year_level;
    document.getElementById('sectionEdit').value = group.section;
    document.getElementById('adviserEdit').value = group.adviser;
    document.getElementById('emailEdit').value = group.email || '';
    document.getElementById('passwordEdit').value = group.password || '';

    // Fill members
    const members = group.members || [];
    for (let i = 1; i <= 5; i++) {
        const memberInput = document.getElementById(`memberEdit${i}`);
        memberInput.value = members[i - 1] ? members[i - 1].full_name : '';
        if (members[i - 1]) {
            memberInput.setAttribute('data-student-id', members[i - 1].id);
        } else {
            memberInput.removeAttribute('data-student-id');
        }
    }

    document.getElementById('editGroupForm').setAttribute('data-editing-id', groupId);
    document.querySelector('.modal-title').textContent = 'Edit Group Details';
    document.getElementById('editGroupModal').classList.add('active');
}

function closeGroupModal() {
    document.getElementById('editGroupModal').classList.remove('active');
}

async function saveGroupChanges(e) {
    e.preventDefault();
    const groupId = document.getElementById('editGroupForm').getAttribute('data-editing-id');

    const groupData = {
        group_name: document.getElementById('groupNameEdit').value,
        program: document.getElementById('programEdit').value,
        year_level: document.getElementById('yearEdit').value,
        section: document.getElementById('sectionEdit').value,
        adviser: document.getElementById('adviserEdit').value,
        email: document.getElementById('emailEdit').value,
        password: document.getElementById('passwordEdit').value
    };

    try {
        let savedGroupId = groupId;

        if (groupId) {
            const { error } = await supabaseClient
                .from('student_groups')
                .update(groupData)
                .eq('id', groupId);
            if (error) throw error;
        } else {
            const { data, error } = await supabaseClient
                .from('student_groups')
                .insert([groupData])
                .select();
            if (error) throw error;
            savedGroupId = data[0].id;
        }

        // Save Members (Update or Insert)
        for (let i = 1; i <= 5; i++) {
            const input = document.getElementById(`memberEdit${i}`);
            const name = input.value.trim();
            const studentId = input.getAttribute('data-student-id');

            if (name) {
                const studentData = { full_name: name, group_id: savedGroupId };
                if (studentId) {
                    await supabaseClient.from('students').update(studentData).eq('id', studentId);
                } else {
                    await supabaseClient.from('students').insert([studentData]);
                }
            } else if (studentId) {
                // Delete if name cleared
                await supabaseClient.from('students').delete().eq('id', studentId);
            }
        }

        showToast(groupId ? 'Group updated successfully!' : 'New group added successfully!');
        closeGroupModal();
        loadGroups();
    } catch (err) {
        console.error('Error saving group:', err);
        alert('Error saving group: ' + err.message);
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

// --- Search Filter ---
document.getElementById('searchInput')?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allGroups.filter(g =>
        g.group_name.toLowerCase().includes(term) ||
        g.program.toLowerCase().includes(term) ||
        g.adviser.toLowerCase().includes(term) ||
        g.members.some(m => m.full_name.toLowerCase().includes(term))
    );
    renderGroups(filtered);
});

async function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../index.html';
}

