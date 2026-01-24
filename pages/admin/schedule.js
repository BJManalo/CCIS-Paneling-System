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
        const program = sched.student_groups ? sched.student_groups.program : '';
        const displayDate = sched.schedule_date ? new Date(sched.schedule_date).toLocaleDateString() : 'No Date';
        const type = sched.schedule_type || 'Defense';

        // Panels string
        const panels = [
            sched.panel1, sched.panel2, sched.panel3, sched.panel4, sched.panel5
        ].filter(p => p).join(', ');

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><span style="font-weight: 500; color: var(--accent-color);">${type}</span></td>
            <td>${groupName}</td>
            <td>${program}</td>
            <td>${displayDate} <br> <span style="font-size: 0.85em; color: #666;">${sched.schedule_time || 'TBA'}</span></td>
            <td>${sched.schedule_venue || 'TBA'}</td>
            <td><span style="font-size: 0.85em;">${panels}</span></td>
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

