// Initialize Supabase client
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

document.addEventListener('DOMContentLoaded', () => {
    loadCapstoneData();
    initCharts();
});

let allData = [];
let groupGrades = {}; // Map of groupId -> Set of graded types (by ME)
let currentTab = 'Title Defense';
let currentFilter = 'ALL';
let currentRole = 'Panel'; // Default
let currentStatusFilter = 'ALL'; // ALL, FINISHED, UNFINISHED
let instructorId = null;
let instructorName = '';

async function loadCapstoneData() {
    const tableBody = document.getElementById('tableBody');
    const emptyState = document.getElementById('emptyState');

    const loginUser = JSON.parse(localStorage.getItem('loginUser'));
    if (!loginUser) {
        window.location.href = '../../';
        return;
    }
    instructorId = loginUser.id;
    instructorName = loginUser.name || loginUser.full_name || '';

    tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px;">Loading data...</td></tr>';
    if (emptyState) emptyState.style.display = 'none';

    try {
        // 1. Fetch Groups with Schedules
        const { data: groups, error: groupsError } = await supabaseClient
            .from('student_groups')
            .select(`
                *,
                schedules (
                    id, 
                    schedule_type, 
                    date, 
                    start_time, 
                    end_time, 
                    room, 
                    panel1, panel2, panel3, panel4, panel5
                )
            `);

        if (groupsError) throw groupsError;

        // 2. Fetch MY Evaluations (to check Finished/Unfinished status)
        // We use 'individual_evaluations' where panelist_name matches me
        const { data: evaluations, error: evalError } = await supabaseClient
            .from('individual_evaluations')
            .select('schedule_id, panelist_name')
            .eq('panelist_name', instructorName); // Assuming exact name match

        if (evalError) throw evalError;

        const evaluatedScheduleIds = new Set((evaluations || []).map(e => e.schedule_id));

        // 3. Process Data for Table
        allData = [];
        groupGrades = {};

        groups.forEach(group => {
            if (!group.schedules) return;

            const schedules = Array.isArray(group.schedules) ? group.schedules : [group.schedules];

            schedules.forEach(sched => {
                const isEvaluated = evaluatedScheduleIds.has(sched.id);
                const normType = normalizeType(sched.schedule_type);

                // Populate dependency map
                if (isEvaluated) {
                    if (!groupGrades[group.id]) groupGrades[group.id] = new Set();
                    groupGrades[group.id].add(normType);
                }

                allData.push({
                    id: group.id,
                    groupName: group.group_name,
                    program: group.program,
                    adviser: group.adviser, // Crucial for Adviser Role
                    type: sched.schedule_type,
                    date: sched.date,
                    time: `${formatTime(sched.start_time)} - ${formatTime(sched.end_time)}`,
                    venue: sched.room,
                    panels: [sched.panel1, sched.panel2, sched.panel3, sched.panel4, sched.panel5].filter(Boolean),

                    // Logic Data
                    normalizedType: normType,
                    scheduleId: sched.id,
                    isEvaluated: isEvaluated
                });
            });
        });

        renderTable();

    } catch (err) {
        console.error('Error loading capstone data:', err);
        tableBody.innerHTML = `<tr><td colspan="8" style="color: red; text-align: center;">Error loading data: ${err.message}</td></tr>`;
    }
}

// Normalize helper (lowercase, remove hyphens/spaces for comparison)
function normalizeType(str) {
    if (!str) return '';
    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function formatTime(timeStr) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
}

// --- Tabs & Locking ---
window.switchTab = (tabName) => {
    currentTab = tabName;
    updateTabStyles(tabName);
    renderTable();
};

function updateTabStyles(activeTab) {
    document.querySelectorAll('.role-tab').forEach(tab => {
        const tabId = tab.id.replace('tab-', ''); // "Title Defense"
        const isLocked = false; // We don't lock the TAB itself globally, we lock ITEMS inside?
        // Or do we lock the whole tab if NO groups are eligible?
        // "Panel... cannot view the submission for pre oral until..."
        // This implies per-group locking.
        // So the tab is always clickable, but the list might be empty or rows locked.
        // Let's simplify: Tab describes the *stage*.

        if (tabId === activeTab) {
            tab.classList.add('active');
            tab.style.fontWeight = '600';
            tab.style.color = 'var(--primary-color)';
            tab.style.borderBottom = '3px solid var(--primary-color)';
        } else {
            tab.classList.remove('active');
            tab.style.fontWeight = '500';
            tab.style.color = '#888';
            tab.style.borderBottom = '3px solid transparent';
        }
    });
}

function updateTabLocks() {
    // Optional: Visual indicator if *user* has pending tasks?
    // For now, just logic in renderTable.
}

// --- Filters ---
// --- Filters ---
const filterBtns = document.querySelectorAll('.filter-btn.bsis, .filter-btn.bsit, .filter-btn.bscs');

window.filterTable = (program) => {
    if (currentFilter === program) {
        currentFilter = 'ALL';
        // Reset valid program buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            if (btn.id.startsWith('filter-')) return; // skip status btns
            btn.classList.remove('active');
        });
    } else {
        currentFilter = program;
        document.querySelectorAll('.filter-btn').forEach(btn => {
            if (btn.id.startsWith('filter-')) return;
            btn.classList.remove('active');
        });
        const activeBtn = document.querySelector(`.filter-btn.${program.toLowerCase()}`);
        if (activeBtn) activeBtn.classList.add('active');
    }
    renderTable();
};

// --- Role Switcher ---
window.switchRole = (role) => {
    currentRole = role;

    const btnPanel = document.getElementById('role-Panel');
    const btnAdviser = document.getElementById('role-Adviser');

    // Reset
    [btnPanel, btnAdviser].forEach(b => {
        if (b) {
            b.classList.remove('active');
            b.style.background = 'transparent';
            b.style.color = '#64748b';
        }
    });

    // Set Active
    const active = role === 'Panel' ? btnPanel : btnAdviser;
    if (active) {
        active.classList.add('active');
        active.style.background = 'var(--primary-color)';
        active.style.color = 'white';
    }

    renderTable();
};

// --- Status Filter ---
window.filterStatus = (status) => {
    currentStatusFilter = status;

    // Reset Styles
    const btnAll = document.getElementById('filter-ALL');
    const btnFin = document.getElementById('filter-FINISHED');
    const btnUnf = document.getElementById('filter-UNFINISHED');

    if (btnAll) { btnAll.style.background = '#5b6b79'; btnAll.style.color = 'white'; }
    if (btnFin) { btnFin.style.background = 'white'; btnFin.style.color = '#10b981'; }
    if (btnUnf) { btnUnf.style.background = 'white'; btnUnf.style.color = '#ef4444'; }

    // Set Active Style
    if (status === 'ALL' && btnAll) {
        btnAll.style.opacity = '1';
    } else if (status === 'FINISHED' && btnFin) {
        btnFin.style.background = '#10b981';
        btnFin.style.color = 'white';
    } else if (status === 'UNFINISHED' && btnUnf) {
        btnUnf.style.background = '#ef4444';
        btnUnf.style.color = 'white';
    }

    renderTable();
};

// --- Render Table ---
function renderTable() {
    const tableBody = document.getElementById('tableBody');
    const emptyState = document.getElementById('emptyState');
    tableBody.innerHTML = '';

    const normCurrentTab = normalizeType(currentTab);
    const uName = (instructorName || '').toLowerCase(); // User Name Normalized

    const filteredData = allData.filter(item => {
        // 1. Filter by Tab (Defense Type)
        if (item.normalizedType !== normCurrentTab) return false;

        // 2. Filter by Program
        if (currentFilter !== 'ALL' && (item.program || '').toUpperCase() !== currentFilter) return false;

        // 3. Filter by Role
        if (currentRole === 'Panel') {
            // Check if user is in panels list
            // Loose check: see if any panel name contains user name or vice versa
            // item.panels is array of strings.
            const inPanel = item.panels.some(p => {
                const pNorm = (p || '').toLowerCase();
                return pNorm.includes(uName) || uName.includes(pNorm);
            });
            if (!inPanel) return false;
        } else if (currentRole === 'Adviser') {
            const advNorm = (item.adviser || '').toLowerCase();
            const isAdviser = advNorm.includes(uName) || uName.includes(advNorm);
            if (!isAdviser) return false;
        }

        // 4. Filter by Status
        if (currentStatusFilter === 'FINISHED') {
            if (!item.isEvaluated) return false;
        } else if (currentStatusFilter === 'UNFINISHED') {
            if (item.isEvaluated) return false;
        }

        return true;
    });

    if (filteredData.length === 0) {
        if (emptyState) emptyState.style.display = 'flex';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    filteredData.forEach(item => {
        // Determine Locks (Dependency Check)
        let isLocked = false;
        let lockReason = '';

        // Only verify dependency if we are in Panel mode (Adviser usually just views)
        // Check dependency on MY grading logic
        // "I cannot view Pre-Oral until I graded Title Defense"
        // Check groupGrades
        const groupEvals = groupGrades[item.id] || new Set();

        if (normCurrentTab === normalizeType('Pre-Oral Defense')) {
            if (!groupEvals.has(normalizeType('Title Defense'))) {
                isLocked = true;
                lockReason = 'Title Defense not evaluated';
            }
        } else if (normCurrentTab === normalizeType('Final Defense')) {
            if (!groupEvals.has(normalizeType('Pre-Oral Defense'))) {
                isLocked = true;
                lockReason = 'Pre-Oral not evaluated';
            }
        }

        // Row Generation
        const row = document.createElement('tr');

        // Action Button
        let actionHtml;
        if (isLocked) {
            actionHtml = `
                <div style="display: flex; flex-direction:column; align-items: start; gap: 2px;">
                     <div style="display: flex; align-items: center; gap: 5px; color: #94a3b8; font-size: 0.9em;">
                        <span class="material-icons-round" style="font-size: 16px;">lock</span>
                        Locked
                    </div>
                    <span style="font-size: 0.75em; color: #ef4444;">${lockReason}</span>
                </div>
            `;
            row.style.background = '#f8fafc';
            row.style.opacity = '0.7';
        } else {
            // View Files Button (Blue)
            actionHtml = `
                <button onclick="viewGroup('${item.id}', '${item.type}')" 
                    style="background: #3b82f6; border: none; color: white; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; font-family: inherit; font-size: 0.85rem; transition: all 0.2s; display: flex; align-items: center; gap: 6px;">
                    <span class="material-icons-round" style="font-size: 18px;">folder_open</span>
                    View Files
                </button>
            `;
        }

        // Panel Chips
        const panelsHtml = item.panels.map(p => `<span class="chip" style="font-size:11px; padding:2px 6px;">${p}</span>`).join(' ');

        row.innerHTML = `
            <td><span class="type-badge ${getTypeClass(item.type)}">${item.type}</span></td>
            <td>
                <div style="font-weight: 600; color: #1e293b;">${item.groupName}</div>
                <div style="font-size: 12px; color: #64748b;">${item.adviser}</div>
            </td>
            <td><span class="prog-badge prog-${(item.program || 'unknown').toLowerCase()}">${item.program}</span></td>
            <td>
                <div style="font-weight: 500;">${item.date || 'TBA'}</div>
                <div style="font-size: 0.85em; color: #64748b;">${item.time}</div>
            </td>
            <td>${item.venue || 'TBA'}</td>
            <td><div style="display:flex; flex-wrap:wrap; gap:4px; max-width: 250px;">${panelsHtml}</div></td>
            <td>${actionHtml}</td>
        `;
        tableBody.appendChild(row);
    });
}

function getTypeClass(type) {
    type = (type || '').toLowerCase();
    if (type.includes('title')) return 'type-title';
    if (type.includes('pre')) return 'type-pre-oral';
    if (type.includes('final')) return 'type-final';
    return 'type-unknown';
}

function initCharts() {
    // keeping empty as before
}

window.viewGroup = (id, type) => {
    // Read only view mock
    alert(`System: Opening read-only files for ${type}.\n(File Viewer Placeholder)`);
};

function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../';
}

