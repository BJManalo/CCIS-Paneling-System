// instructor_schedule.js

// --- Supabase Configuration ---
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';

// Initialize Supabase client
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

// State
let allSchedules = [];
let fetchedGroups = []; // Keeping for potential future use or consistency
let currentRole = 'Panel'; // Default role

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
});

// --- Role Switching ---
window.switchRole = (role) => {
    currentRole = role;

    // Update active buttons
    document.querySelectorAll('.role-filter-btn').forEach(btn => {
        if (btn.id === `role-${role}`) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Re-render with new filter
    applyFiltersAndRender();
};

// --- Fetch Schedules ---
async function getSchedules() {
    console.log('Fetching schedules...');
    try {
        const { data: schedules, error } = await supabaseClient
            .from('schedules')
            .select(`
                *,
                student_groups ( group_name, program, adviser )
            `)
            .order('schedule_date', { ascending: false });

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

    const userJson = localStorage.getItem('loginUser');
    if (!userJson) return;
    const user = JSON.parse(userJson);
    const userName = user.name || user.full_name;

    tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Loading your schedules...</td></tr>';

    const schedules = await getSchedules();

    // Filter schedules where the user is INVOLVED (Panel OR Adviser)
    // We store all relevant schedules locally and filter by View Mode later
    const mySchedules = schedules.filter(sched => {
        const panels = [sched.panel1, sched.panel2, sched.panel3, sched.panel4, sched.panel5];
        const isPanel = panels.includes(userName);
        const isAdviser = sched.student_groups && sched.student_groups.adviser === userName;

        return isPanel || isAdviser;
    });

    allSchedules = mySchedules;
    applyFiltersAndRender();
}

function applyFiltersAndRender() {
    const userJson = localStorage.getItem('loginUser');
    const user = userJson ? JSON.parse(userJson) : {};
    const userName = user.name || user.full_name;

    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';

    const filtered = allSchedules.filter(sched => {
        // 1. Role Filter
        const panels = [sched.panel1, sched.panel2, sched.panel3, sched.panel4, sched.panel5];
        const isPanel = panels.includes(userName);
        const isAdviser = sched.student_groups && sched.student_groups.adviser === userName;

        if (currentRole === 'Panel' && !isPanel) return false;
        if (currentRole === 'Adviser' && !isAdviser) return false;

        // 2. Search Filter
        const groupName = (sched.student_groups?.group_name || '').toLowerCase();
        const program = (sched.student_groups?.program || '').toLowerCase();
        const venue = (sched.schedule_venue || '').toLowerCase();
        const type = (sched.schedule_type || '').toLowerCase();
        const panelsStr = panels.filter(p => p).join(' ').toLowerCase();

        const matchesSearch = groupName.includes(searchTerm) ||
            program.includes(searchTerm) ||
            venue.includes(searchTerm) ||
            type.includes(searchTerm) ||
            panelsStr.includes(searchTerm);

        return matchesSearch;
    });

    renderSchedules(filtered);
}

function renderSchedules(schedules) {
    const tableBody = document.getElementById('scheduleTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (!schedules || schedules.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 30px; color: #64748b;">No ${currentRole.toLowerCase()} schedules found.</td></tr>`;
        return;
    }

    schedules.forEach(sched => {
        const groupName = sched.student_groups ? sched.student_groups.group_name : 'Unknown Group';
        const program = sched.student_groups ? sched.student_groups.program : '';
        const displayDate = sched.schedule_date ? new Date(sched.schedule_date).toLocaleDateString() : 'No Date';
        const displayTime = sched.schedule_time || '-';
        const displayVenue = sched.schedule_venue || '-';
        const type = sched.schedule_type || 'Defense';

        // Panels string
        const panels = [
            sched.panel1, sched.panel2, sched.panel3, sched.panel4, sched.panel5
        ].filter(p => p).join(', ');

        // Chips for panels
        // const panelChips = [sched.panel1, sched.panel2, sched.panel3, sched.panel4, sched.panel5]
        //    .filter(p => p)
        //    .map(p => `<span style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; margin-right: 4px; display: inline-block;">${p}</span>`)
        //    .join('');


        const row = document.createElement('tr');
        row.innerHTML = `
            <td><span style="font-weight: 600; font-size: 0.85em; background: #e0f2fe; color: #0284c7; padding: 4px 8px; border-radius: 4px;">${type}</span></td>
            <td>
                <div style="font-weight: 600; color: #334155;">${groupName}</div>
            </td>
            <td>${program}</td>
            <td>
                <div style="font-weight: 500;">${displayDate}</div>
                <div style="font-size: 0.85em; color: #64748b;">${displayTime}</div>
            </td>
            <td>${displayVenue}</td>
            <td><span style="font-size: 0.85em; color: #475569;">${panels}</span></td>
        `;
        tableBody.appendChild(row);
    });
}

// --- Search Filter Listener ---
document.getElementById('searchInput')?.addEventListener('input', (e) => {
    applyFiltersAndRender();
});

function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../index.html';
}


