// instructor_schedule.js

// --- Supabase Configuration ---
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';

// Initialize Supabase client
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

// State
let allSchedules = [];
let fetchedGroups = [];
const allPanels = [
    "May Lynn Farren",
    "Nolan Yumen",
    "Apolinario Ballenas Jr.",
    "Irene Robles",
    "Levi John Bernesto",
    "Vexter Jeff Ojeno",
    "Myra Samillano"
];

document.addEventListener('DOMContentLoaded', () => {
    loadSchedules();
    checkUrlParams();
});

// Check if we came from the Accounts page to schedule a specific group
function checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const groupId = params.get('groupId');
    if (groupId) {
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
        setTimeout(() => openScheduleModal(groupId), 500);
    }
}

// --- Fetch Schedules ---
async function getSchedules() {
    console.log('Fetching schedules...');
    try {
        const { data: schedules, error } = await supabaseClient
            .from('schedules')
            .select(`
                *,
                student_groups ( group_name, program )
            `)
            .order('schedule_date', { ascending: true });

        if (error) {
            console.error('Error fetching schedules:', error);
            return [];
        }
        return schedules;
    } catch (err) {
        console.error('Unexpected error:', err);
        return [];
    }
}

// --- Load Schedules into UI ---
async function loadSchedules() {
    const tableBody = document.getElementById('scheduleTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 20px;">Loading schedules...</td></tr>';

    const schedules = await getSchedules();
    allSchedules = schedules;
    renderSchedules(allSchedules);
}

function renderSchedules(schedules) {
    const tableBody = document.getElementById('scheduleTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (!schedules || schedules.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 20px;">No schedules found.</td></tr>';
        return;
    }

    schedules.forEach(sched => {
        const groupName = sched.student_groups ? sched.student_groups.group_name : 'Unknown Group';
        const program = (sched.student_groups ? (sched.student_groups.program || '') : '').toUpperCase();
        const displayDate = sched.schedule_date ? new Date(sched.schedule_date).toLocaleDateString() : 'No Date';
        const displayTime = sched.schedule_time || 'TBA';
        const type = sched.schedule_type || 'Defense';
        const adviser = sched.adviser || (sched.student_groups ? sched.student_groups.adviser : '-');
        const venue = sched.schedule_venue || 'TBA';

        // Defense Type Logic
        let typeClass = 'type-unknown';
        const lowerType = type.toLowerCase();
        if (lowerType.includes('title')) typeClass = 'type-title';
        else if (lowerType.includes('pre-oral') || lowerType.includes('preoral')) typeClass = 'type-pre-oral';
        else if (lowerType.includes('final')) typeClass = 'type-final';

        // Program Logic
        let progClass = 'prog-unknown';
        if (program.includes('BSIS')) progClass = 'prog-bsis';
        else if (program.includes('BSIT')) progClass = 'prog-bsit';
        else if (program.includes('BSCS')) progClass = 'prog-bscs';

        // Panels list with chips
        const panelArray = [sched.panel1, sched.panel2, sched.panel3, sched.panel4, sched.panel5].filter(p => p);
        const panelsHtml = panelArray.map(p => `<span class="chip">${p}</span>`).join('');

        // Main Row
        const row = document.createElement('tr');
        row.className = 'main-row';
        row.id = `sched-row-${sched.id}`;
        row.onclick = () => toggleScheduleRow(sched.id);

        row.innerHTML = `
            <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="material-icons-round expand-icon" id="sched-icon-${sched.id}" style="font-size: 18px;">expand_more</span>
                    <span class="type-badge ${typeClass}">${type}</span>
                </div>
            </td>
            <td style="font-weight: 600; color: var(--primary-dark);">${groupName}</td>
            <td><span class="prog-badge ${progClass}">${program}</span></td>
            <td>
                <div style="font-weight: 600; color: #1e293b;">${displayDate}</div>
                <div style="font-size: 11px; color: #64748b; font-weight: 500;">${displayTime}</div>
            </td>
            <td>
                <div style="display: flex; align-items: center; gap: 4px; color: #475569;">
                    <span class="material-icons-round" style="font-size: 14px; color: var(--primary-color);">place</span>
                    ${venue}
                </div>
            </td>
            <td>
                <div class="chips-container">
                    ${panelsHtml || '<span style="color:#94a3b8; font-style:italic; font-size:11px;">Not Assigned</span>'}
                </div>
            </td>
            <td>
                <div style="display: flex; gap: 8px;">
                    <button class="action-btn edit" onclick="event.stopPropagation(); openEditScheduleModal('${sched.id}')" title="Edit Schedule">
                        <span class="material-icons-round">edit</span>
                    </button>
                    <button class="action-btn" onclick="event.stopPropagation(); deleteSchedule('${sched.id}')" title="Delete Schedule" style="color: #ef4444; border-color: #fee2e2;">
                        <span class="material-icons-round">delete</span>
                    </button>
                </div>
            </td>
        `;
        tableBody.appendChild(row);

        // Details Row
        const detailsRow = document.createElement('tr');
        detailsRow.className = 'details-row';
        detailsRow.id = `sched-details-${sched.id}`;

        detailsRow.innerHTML = `
            <td colspan="7" style="padding: 0;">
                <div class="details-content" style="padding: 15px 25px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;">
                        <div>
                            <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 5px;">Group Adviser</div>
                            <div style="font-weight: 500; color: #334155;">${adviser}</div>
                        </div>
                        <div>
                            <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 5px;">Academic Info</div>
                            <div style="font-weight: 500; color: #334155;">${program} - Year level ${sched.student_groups?.year_level || '-'}</div>
                        </div>
                    </div>
                </div>
            </td>
        `;
        tableBody.appendChild(detailsRow);
    });
}

// Toggle Row Helper
window.toggleScheduleRow = function (id) {
    const details = document.getElementById(`sched-details-${id}`);
    const row = document.getElementById(`sched-row-${id}`);

    if (details && row) {
        details.classList.toggle('active');
        row.classList.toggle('expanded');
    }
}

// --- Delete Schedule ---
async function deleteSchedule(id) {
    if (!confirm('Are you sure you want to delete this schedule?')) return;

    try {
        const { error } = await supabaseClient
            .from('schedules')
            .delete()
            .eq('id', id);

        if (error) throw error;
        showToast('Schedule deleted successfully');
        loadSchedules();
    } catch (err) {
        alert('Error deleting schedule: ' + err.message);
    }
}

// --- Filter Changes ---
function applyFilters() {
    const term = document.getElementById('searchInput').value.toLowerCase();
    const phase = document.getElementById('phaseFilter').value;

    const filtered = allSchedules.filter(sched => {
        const groupName = (sched.student_groups?.group_name || '').toLowerCase();
        const program = (sched.student_groups?.program || '').toLowerCase();
        const venue = (sched.schedule_venue || '').toLowerCase();
        const type = (sched.schedule_type || '');

        const matchesSearch = groupName.includes(term) || program.includes(term) || venue.includes(term) || type.toLowerCase().includes(term);
        const matchesPhase = phase === 'All' || type === phase;

        return matchesSearch && matchesPhase;
    });
    renderSchedules(filtered);
}

document.getElementById('searchInput')?.addEventListener('input', applyFilters);
document.getElementById('phaseFilter')?.addEventListener('change', applyFilters);

// --- Fetch Groups for Dropdown ---
async function fetchGroupsForDropdown() {
    try {
        // Fetch all Groups
        const { data: groups, error: groupsError } = await supabaseClient
            .from('student_groups')
            .select('*');

        if (groupsError) throw groupsError;
        let allGroups = groups;

        // Fetch all Payments
        const { data: payments, error: paymentsError } = await supabaseClient
            .from('payments')
            .select('group_id');

        if (paymentsError) throw paymentsError;

        // Create a Set of Group IDs that have made payments
        const paidGroupIds = new Set(payments.map(p => p.group_id));

        // Filter groups: Only keep those that are in the paid set
        fetchedGroups = allGroups.filter(g => paidGroupIds.has(g.id));

        // Fetch students to show members
        const { data: students, error: studentsError } = await supabaseClient
            .from('students')
            .select('*');

        if (!studentsError) {
            fetchedGroups = fetchedGroups.map(g => {
                const members = students.filter(s => s.group_id === g.id);
                return { ...g, members };
            });
        }

        const select = document.getElementById('schedGroupId');
        if (!select) return;
        select.innerHTML = '<option value="">Select Group</option>';

        fetchedGroups.forEach(group => {
            const option = document.createElement('option');
            option.value = group.id;
            option.textContent = group.group_name;
            select.appendChild(option);
        });
    } catch (err) {
        console.error("Error loading groups:", err);
    }
}

function handleGroupChange() {
    const select = document.getElementById('schedGroupId');
    const groupId = select.value;
    const membersDiv = document.getElementById('schedMembers');

    if (!groupId) {
        if (membersDiv) membersDiv.textContent = 'Select a group to see members';
        resetPanels();
        return;
    }

    const selectedGroup = fetchedGroups.find(g => g.id == groupId);
    if (selectedGroup) {
        if (membersDiv) {
            membersDiv.textContent = selectedGroup.members && selectedGroup.members.length > 0
                ? selectedGroup.members.map(m => m.full_name).join(', ')
                : 'No members found.';
        }

        // Set Adviser and Program
        const adviserInput = document.getElementById('schedAdviser');
        if (adviserInput) adviserInput.value = selectedGroup.adviser || '';

        const programInput = document.getElementById('schedProgram');
        if (programInput) programInput.value = selectedGroup.program || '';

        updatePanelsByDefenseType();
    }
}

function handleTypeChange() {
    updatePanelsByDefenseType();
}

function updatePanelsByDefenseType() {
    const groupId = document.getElementById('schedGroupId').value;
    const type = document.getElementById('schedType').value;

    if (!groupId) return;

    // Reset panel lock states AND values first to ensure a clean slate
    const panelIds = ['schedPanel1', 'schedPanel2', 'schedPanel3', 'schedPanel4', 'schedPanel5'];
    panelIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.value = ""; // Clear existing value
            el.disabled = false;
            el.style.backgroundColor = "";
            el.style.cursor = "";
        }
    });

    if (type === 'Title Defense') {
        applyDefaultPanels();
    } else {
        // Pre-Oral or Final Defense: Look for existing Title Defense to inherit panels
        const titleDefense = allSchedules.find(s => s.group_id == groupId && s.schedule_type === 'Title Defense');

        if (titleDefense) {
            // Inherit ALL panels from Title Defense and lock them
            const pKeys = ['panel1', 'panel2', 'panel3', 'panel4', 'panel5'];
            pKeys.forEach((key, index) => {
                const select = document.getElementById(`schedPanel${index + 1}`);
                if (select) {
                    select.value = titleDefense[key] || "";
                    if (titleDefense[key]) {
                        lockPanel(select);
                    } else {
                        select.disabled = false;
                        select.style.backgroundColor = "";
                        select.style.cursor = "";
                    }
                }
            });
            updatePanelOptions();
        } else {
            // Fallback to program-based defaults if Title Defense schedule not found
            applyDefaultPanels();
        }
    }
}

function lockPanel(el) {
    el.disabled = true;
    el.style.backgroundColor = "#f1f5f9";
    el.style.cursor = "not-allowed";
}

function applyDefaultPanels() {
    const groupId = document.getElementById('schedGroupId').value;
    const selectedGroup = fetchedGroups.find(g => g.id == groupId);
    if (!selectedGroup) return;

    const program = selectedGroup.program ? selectedGroup.program.toUpperCase() : '';
    const p1Select = document.getElementById('schedPanel1');
    const p2Select = document.getElementById('schedPanel2');

    // Default: May Lynn Farren is always panel 1 for these programs
    if (p1Select) {
        if (program.includes('BSIS') || program.includes('BSIT') || program.includes('BSCS')) {
            p1Select.value = "May Lynn Farren";
            lockPanel(p1Select);
        }
    }

    if (p2Select) {
        if (program.includes('BSIS')) {
            p2Select.value = "Apolinario Ballenas Jr.";
            lockPanel(p2Select);
        } else if (program.includes('BSIT')) {
            p2Select.value = "Nolan Yumen";
            lockPanel(p2Select);
        } else if (program.includes('BSCS')) {
            p2Select.value = "Irene Robles";
            lockPanel(p2Select);
        }
    }
    updatePanelOptions();
}

function updatePanelOptions() {
    const ids = ['schedPanel1', 'schedPanel2', 'schedPanel3', 'schedPanel4', 'schedPanel5'];
    const selections = ids.map(id => document.getElementById(id)?.value || '');

    ids.forEach((id, index) => {
        const select = document.getElementById(id);
        if (!select) return;
        const myValue = selections[index];

        select.innerHTML = '<option value="">Select Panel</option>';
        allPanels.forEach(panel => {
            const isTakenByOthers = selections.some((val, idx) => idx !== index && val === panel);
            if (!isTakenByOthers) {
                const option = document.createElement('option');
                option.value = panel;
                option.textContent = panel;
                if (panel === myValue) option.selected = true;
                select.appendChild(option);
            }
        });
    });
}

function resetPanels() {
    const adviserInput = document.getElementById('schedAdviser');
    if (adviserInput) adviserInput.value = "";

    const programInput = document.getElementById('schedProgram');
    if (programInput) programInput.value = "";

    const ids = ['schedPanel1', 'schedPanel2', 'schedPanel3', 'schedPanel4', 'schedPanel5'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.value = "";
            el.disabled = false;
            el.style.backgroundColor = "";
            el.style.cursor = "";
        }
    });
    updatePanelOptions();
}

async function openScheduleModal(preSelectedGroupId = null) {
    await fetchGroupsForDropdown();
    document.getElementById('scheduleForm').reset();
    document.getElementById('scheduleForm').removeAttribute('data-editing-id');
    document.querySelector('.modal-title').textContent = 'Select Panel and Set Schedule';
    document.getElementById('schedMembers').textContent = 'Select a group to see members';
    document.getElementById('schedGroupId').disabled = false;

    if (preSelectedGroupId) {
        document.getElementById('schedGroupId').value = preSelectedGroupId;
        handleGroupChange();
    } else {
        resetPanels();
    }

    document.getElementById('scheduleModal').classList.add('active');
}

async function openEditScheduleModal(scheduleId) {
    await fetchGroupsForDropdown();
    const { data: sched, error } = await supabaseClient
        .from('schedules')
        .select('*, student_groups(program)')
        .eq('id', scheduleId)
        .single();
    if (error) return;

    document.getElementById('schedType').value = sched.schedule_type || 'Title Defense';
    document.getElementById('schedGroupId').value = sched.group_id;
    handleGroupChange();

    const programInput = document.getElementById('schedProgram');
    if (programInput) programInput.value = (sched.student_groups?.program || '').toUpperCase();

    document.getElementById('schedPanel1').value = sched.panel1 || '';
    document.getElementById('schedPanel2').value = sched.panel2 || '';
    document.getElementById('schedPanel3').value = sched.panel3 || '';
    document.getElementById('schedPanel4').value = sched.panel4 || '';
    document.getElementById('schedPanel5').value = sched.panel5 || '';

    document.getElementById('schedDate').value = sched.schedule_date;
    document.getElementById('schedTime').value = sched.schedule_time;
    document.getElementById('schedVenue').value = sched.schedule_venue;

    updatePanelOptions();
    document.getElementById('scheduleForm').setAttribute('data-editing-id', scheduleId);
    document.querySelector('.modal-title').textContent = 'Edit Schedule';
    document.getElementById('scheduleModal').classList.add('active');
}

function closeScheduleModal() {
    document.getElementById('scheduleModal').classList.remove('active');
}

async function saveSchedule(e) {
    e.preventDefault();
    const editingId = document.getElementById('scheduleForm').getAttribute('data-editing-id');
    const scheduleData = {
        schedule_type: document.getElementById('schedType').value,
        group_id: document.getElementById('schedGroupId').value,
        panel1: document.getElementById('schedPanel1').value,
        panel2: document.getElementById('schedPanel2').value,
        panel3: document.getElementById('schedPanel3').value,
        panel4: document.getElementById('schedPanel4').value,
        panel5: document.getElementById('schedPanel5').value,
        adviser: document.getElementById('schedAdviser').value,
        schedule_date: document.getElementById('schedDate').value,
        schedule_time: document.getElementById('schedTime').value,
        schedule_venue: document.getElementById('schedVenue').value
    };

    const { error } = editingId
        ? await supabaseClient.from('schedules').update(scheduleData).eq('id', editingId)
        : await supabaseClient.from('schedules').upsert(scheduleData, { onConflict: 'group_id, schedule_type' });

    if (!error) {
        showToast(editingId ? 'Schedule updated!' : 'Schedule added!');
        closeScheduleModal();
        loadSchedules();
    } else {
        alert(error.message);
    }
}

// --- Toast Feedback ---
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
    window.location.href = '../../index.html';
}

