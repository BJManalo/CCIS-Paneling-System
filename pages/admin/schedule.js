// schedule.js (Admin View Only)

// --- Supabase Configuration ---
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';

// Initialize Supabase client
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

// State
let allSchedules = [];

document.addEventListener('DOMContentLoaded', () => {
    loadSchedules();
    setupSearch();
});

// --- Load Schedules ---
async function loadSchedules() {
    const tableBody = document.getElementById('scheduleTableBody');
    tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Loading schedules...</td></tr>';

    try {
        const { data: schedules, error } = await supabaseClient
            .from('schedules')
            .select(`
                *,
                student_groups ( group_name, program )
            `)
            .order('schedule_date', { ascending: true }); // Show upcoming first

        if (error) throw error;

        allSchedules = schedules;
        renderSchedules(allSchedules);

    } catch (err) {
        console.error('Error loading schedules:', err);
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red;">Error loading schedules.</td></tr>';
    }
}

// --- Render Schedules ---
function renderSchedules(schedules) {
    const tableBody = document.getElementById('scheduleTableBody');
    tableBody.innerHTML = '';

    if (!schedules || schedules.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">No schedules found.</td></tr>';
        return;
    }

    schedules.forEach(sched => {
        const groupName = sched.student_groups ? sched.student_groups.group_name : 'Unknown Group';
        const program = sched.student_groups ? (sched.student_groups.program || '').toUpperCase() : '';
        const displayDate = sched.schedule_date ? new Date(sched.schedule_date).toLocaleDateString() : 'No Date';
        const type = sched.schedule_type || 'Defense';

        // --- Defense Type Logic ---
        let typeClass = 'type-unknown';
        const lowerType = type.toLowerCase();
        if (lowerType.includes('title')) typeClass = 'type-title';
        else if (lowerType.includes('pre-oral') || lowerType.includes('preoral')) typeClass = 'type-pre-oral';
        else if (lowerType.includes('final')) typeClass = 'type-final';

        // --- Program Logic ---
        let progClass = 'prog-unknown';
        if (program.includes('BSIS')) progClass = 'prog-bsis';
        else if (program.includes('BSIT')) progClass = 'prog-bsit';
        else if (program.includes('BSCS')) progClass = 'prog-bscs';

        // Panels list with chips
        const panelArray = [sched.panel1, sched.panel2, sched.panel3, sched.panel4, sched.panel5].filter(p => p);
        const panelsHtml = panelArray.map(p => `<span class="chip">${p}</span>`).join('');

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <span class="type-badge ${typeClass}">
                    ${type}
                </span>
            </td>
            <td style="font-weight: 600; color: var(--primary-dark);">${groupName}</td>
            <td><span class="prog-badge ${progClass}">${program}</span></td>
            <td>
                <div style="font-weight: 600; color: #1e293b;">${displayDate}</div>
                <div style="font-size: 11px; color: #64748b; font-weight: 500;">${sched.schedule_time || 'TBA'}</div>
            </td>
            <td>
                <div style="display: flex; align-items: center; gap: 4px; color: #475569;">
                    <span class="material-icons-round" style="font-size: 14px; color: var(--primary-color);">place</span>
                    ${sched.schedule_venue || 'TBA'}
                </div>
            </td>
            <td>
                <div class="chips-container">
                    ${panelsHtml || '<span style="color:#94a3b8; font-style:italic; font-size:11px;">Not Assigned</span>'}
                </div>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

// --- Search Functionality ---
function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = allSchedules.filter(sched => {
            const groupName = (sched.student_groups?.group_name || '').toLowerCase();
            const panelStr = [sched.panel1, sched.panel2, sched.panel3, sched.panel4, sched.panel5].join(' ').toLowerCase();
            return groupName.includes(term) || panelStr.includes(term);
        });
        renderSchedules(filtered);
    });
}

// --- Logout ---
function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../index.html';
}
