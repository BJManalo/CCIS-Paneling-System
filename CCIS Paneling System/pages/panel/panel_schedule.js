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
});

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

    const userJson = localStorage.getItem('loginUser');
    if (!userJson) return;
    const user = JSON.parse(userJson);
    const userName = user.name || user.full_name;

    tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Loading your schedules...</td></tr>';

    const schedules = await getSchedules();

    // Filter schedules where the user is one of the panels
    const mySchedules = schedules.filter(sched => {
        const panels = [sched.panel1, sched.panel2, sched.panel3, sched.panel4, sched.panel5];
        // Also check if they are the adviser as requested in previous steps, 
        // but user specifically said "where the name of his account is in the panel"
        // Let's stick to the panel filter for now.
        return panels.includes(userName);
    });

    allSchedules = mySchedules;
    renderSchedules(allSchedules);
}

function renderSchedules(schedules) {
    const tableBody = document.getElementById('scheduleTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (!schedules || schedules.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">No schedules assigned to you.</td></tr>';
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

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><span style="font-weight: 500; color: var(--accent-color);">${type}</span></td>
            <td>${groupName}</td>
            <td>${program}</td>
            <td>${displayDate} <br> <span style="font-size: 0.85em; color: #666;">${displayTime}</span></td>
            <td>${displayVenue}</td>
            <td><span style="font-size: 0.85em;">${panels}</span></td>
        `;
        tableBody.appendChild(row);
    });
}

// --- Search Filter ---
document.getElementById('searchInput')?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allSchedules.filter(sched => {
        const groupName = (sched.student_groups?.group_name || '').toLowerCase();
        const program = (sched.student_groups?.program || '').toLowerCase();
        const venue = (sched.schedule_venue || '').toLowerCase();
        const type = (sched.schedule_type || '').toLowerCase();
        const panels = [sched.panel1, sched.panel2, sched.panel3, sched.panel4, sched.panel5]
            .filter(p => p).join(' ').toLowerCase();

        return groupName.includes(term) || program.includes(term) || venue.includes(term) || type.includes(term) || panels.includes(term);
    });
    renderSchedules(filtered);
});

function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../index.html';
}

