// instructor_schedule.js

// --- Supabase Configuration ---
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';

// Initialize Supabase client
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

// State
let allSchedules = [];
let fetchedGroups = []; // Keeping this if needed for other logic, though not used heavily here yet
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

function switchRole(role) {
    currentRole = role;

    // Update active buttons
    document.querySelectorAll('.role-filter-btn').forEach(btn => {
        if (btn.id === `role-${role}`) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    renderSchedules(allSchedules);
}

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

    tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">Loading your schedules...</td></tr>';

    const schedules = await getSchedules();

    // Filter schedules where the user is one of the panels OR the adviser
    // We fetch ALL relevant schedules first, then filter by tab in render
    const mySchedules = schedules.filter(sched => {
        const panels = [sched.panel1, sched.panel2, sched.panel3, sched.panel4, sched.panel5];
        const adviser = sched.student_groups ? sched.student_groups.adviser : null;

        return panels.includes(userName) || adviser === userName;
    });

    allSchedules = mySchedules;
    renderSchedules(allSchedules);
}

function renderSchedules(schedules) {
    const tableBody = document.getElementById('scheduleTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    const userJson = localStorage.getItem('loginUser');
    const user = userJson ? JSON.parse(userJson) : null;
    const userName = user ? (user.name || user.full_name) : '';

    if (!schedules || schedules.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">No schedules found.</td></tr>';
        return;
    }

    // Filter by Current Role Tab
    const filteredByRole = schedules.filter(sched => {
        const panels = [sched.panel1, sched.panel2, sched.panel3, sched.panel4, sched.panel5];
        const adviser = sched.student_groups ? sched.student_groups.adviser : null;

        if (currentRole === 'Panel') {
            return panels.includes(userName);
        } else if (currentRole === 'Adviser') {
            return adviser === userName;
        }
        return false;
    });

    if (filteredByRole.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 20px;">No ${currentRole} schedules found.</td></tr>`;
        return;
    }

    filteredByRole.forEach(sched => {
        const groupName = sched.student_groups ? sched.student_groups.group_name : 'Unknown Group';
        const program = sched.student_groups ? sched.student_groups.program : '';
        const adviser = sched.student_groups ? sched.student_groups.adviser : '';
        const displayDate = sched.schedule_date ? new Date(sched.schedule_date).toLocaleDateString() : 'No Date';
        const displayTime = sched.schedule_time || '-';
        const displayVenue = sched.schedule_venue || '-';
        const type = sched.schedule_type || 'Defense';

        // Panels string
        const panelList = [
            sched.panel1, sched.panel2, sched.panel3, sched.panel4, sched.panel5
        ].filter(p => p);
        const panels = panelList.join(', ');

        // Determine Role for Label (even if redundant with tab, good for dual roles)
        const isPanel = panelList.includes(userName);
        const isAdviser = (adviser === userName);

        let roleHtml = '';
        if (isAdviser) {
            roleHtml += `<span style="background: #e0f2fe; color: #0284c7; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; display: inline-block; margin-right: 4px;">Adviser</span>`;
        }
        if (isPanel) {
            roleHtml += `<span style="background: #f1f5f9; color: #475569; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; display: inline-block;">Panel</span>`;
        }

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><span style="font-weight: 500; color: var(--accent-color);">${type}</span></td>
            <td>${roleHtml}</td>
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

    // We filter from 'allSchedules' first by term, then renderSchedules will filter by Role
    const filtered = allSchedules.filter(sched => {
        const groupName = (sched.student_groups?.group_name || '').toLowerCase();
        const program = (sched.student_groups?.program || '').toLowerCase();
        const venue = (sched.schedule_venue || '').toLowerCase();
        const type = (sched.schedule_type || '').toLowerCase();
        const panels = [sched.panel1, sched.panel2, sched.panel3, sched.panel4, sched.panel5]
            .filter(p => p).join(' ').toLowerCase();

        return groupName.includes(term) || program.includes(term) || venue.includes(term) || type.includes(term) || panels.includes(term);
    });

    // Pass filtered list to render (which will then slice by currentRole)
    // Actually, renderSchedules takes a list and applies role filter. 
    // So if we pass filtered result here, it will work.
    renderSchedules(filtered);
});

function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../index.html';
}

