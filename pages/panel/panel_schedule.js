// State
let allSchedules = [];
let filteredSchedules = [];
let currentRole = 'Panel'; // Default role
let calendarDate = new Date();

// --- Helper Functions ---
function formatTime12Hour(timeStr) {
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    let hours = parseInt(parts[0], 10);
    const minutes = parts[1];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours}:${minutes} ${ampm}`;
}

const fuzzyMatch = (nameA, nameB) => {
    const nA = String(nameA || "").trim().toLowerCase();
    const nB = String(nameB || "").trim().toLowerCase();
    if (!nA || !nB) return false;
    if (nA === nB) return true;
    
    // Split into words and check if all words of one are in the other
    const wA = nA.split(/\s+/).filter(w => w);
    const wB = nB.split(/\s+/).filter(w => w);
    
    if (wA.length === 0 || wB.length === 0) return false;
    
    if (wA.length <= wB.length) return wA.every(word => wB.includes(word));
    return wB.every(word => wA.includes(word));
};

document.addEventListener('DOMContentLoaded', async () => {
    const loginUser = JSON.parse(localStorage.getItem('loginUser'));
    if (!loginUser) {
        window.location.href = '../../';
        return;
    }
    await loadSchedules();
});

// --- Role Switching ---
window.switchRole = (role) => {
    currentRole = role;
    document.querySelectorAll('.role-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.id === `role-${role}`);
    });
    applyFiltersAndRender();
};

// --- Data Fetching ---
async function getSchedules() {
    try {
        const { data, error } = await supabaseClient
            .from('schedules')
            .select('*, student_groups ( group_name, program, adviser )')
            .order('schedule_date', { ascending: false });

        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Error fetching schedules:', err);
        return [];
    }
}

async function loadSchedules() {
    const userJson = localStorage.getItem('loginUser');
    if (!userJson) return;
    const user = JSON.parse(userJson);
    const userNameNormalized = String(user.name || user.full_name || '').trim().toLowerCase();

    const schedules = await getSchedules();

    // Filter schedules where the user is involved in ANY capacity
    allSchedules = schedules.filter(sched => {
        const panels = [sched.panel1, sched.panel2, sched.panel3, sched.panel4, sched.panel5].filter(p => p);
        const isPanel = panels.some(p => fuzzyMatch(p, userNameNormalized));
        const isAdviser = fuzzyMatch(sched.student_groups?.adviser, userNameNormalized);
        return isPanel || isAdviser;
    });

    applyFiltersAndRender();
}

// --- Calendar Logic ---
function prevMonth() {
    calendarDate.setMonth(calendarDate.getMonth() - 1);
    renderCalendar();
}

function nextMonth() {
    calendarDate.setMonth(calendarDate.getMonth() + 1);
    renderCalendar();
}

function applyFiltersAndRender() {
    const userJson = localStorage.getItem('loginUser');
    const user = userJson ? JSON.parse(userJson) : {};
    const userNameNormalized = String(user.name || user.full_name || '').trim().toLowerCase();
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';

    filteredSchedules = allSchedules.filter(sched => {
        // 1. Role Context Filter
        const panels = [sched.panel1, sched.panel2, sched.panel3, sched.panel4, sched.panel5].filter(p => p);
        const isPanel = panels.some(p => fuzzyMatch(p, userNameNormalized));
        const isAdviser = fuzzyMatch(sched.student_groups?.adviser, userNameNormalized);

        if (currentRole === 'Panel' && !isPanel) return false;
        if (currentRole === 'Adviser' && !isAdviser) return false;

        // 2. Search Filter
        const groupName = (sched.student_groups?.group_name || '').toLowerCase();
        const program = (sched.student_groups?.program || '').toLowerCase();
        const type = (sched.schedule_type || '').toLowerCase();
        
        return groupName.includes(searchTerm) || program.includes(searchTerm) || type.includes(searchTerm);
    });

    renderCalendar();
}

function renderCalendar() {
    const calendarDays = document.getElementById('calendarDays');
    const calendarMonth = document.getElementById('calendarMonth');
    if (!calendarDays || !calendarMonth) return;

    calendarDays.innerHTML = '';
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();

    calendarMonth.textContent = calendarDate.toLocaleDateString('default', { month: 'long', year: 'numeric' });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    // Fill empty cells from previous month
    for (let i = 0; i < firstDay; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.style.cssText = 'background: #fcfcfc; padding: 15px; min-height: 130px; border: 1px solid #f1f5f9;';
        calendarDays.appendChild(emptyDay);
    }

    // Render each day
    for (let day = 1; day <= daysInMonth; day++) {
        const dayEl = document.createElement('div');
        const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;

        dayEl.style.cssText = `
            background: white; padding: 12px; min-height: 130px; 
            border: 1px solid #f1f5f9; transition: background 0.2s;
        `;

        dayEl.innerHTML = `
            <div style="font-weight: 700; color: ${isToday ? 'var(--primary-color)' : '#1e293b'}; margin-bottom: 8px; font-size: 0.9rem;">
                ${day}
            </div>
            <div id="events-${year}-${month + 1}-${day}" style="display: flex; flex-direction: column; gap: 4px;"></div>
        `;
        calendarDays.appendChild(dayEl);

        // Map events to this specific day number
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayEvents = filteredSchedules.filter(s => s.schedule_date === dateStr);

        const container = dayEl.querySelector(`#events-${year}-${month + 1}-${day}`);
        dayEvents.forEach(sched => {
            const evEl = document.createElement('div');
            const typeLower = (sched.schedule_type || '').toLowerCase();
            
            let bg = '#dbeafe', color = '#1e40af'; // Blue
            if (typeLower.includes('pre-oral') || typeLower.includes('pre oral')) { bg = '#fef3c7'; color = '#92400e'; } // Orange
            else if (typeLower.includes('final')) { bg = '#dcfce7'; color = '#166534'; } // Green

            evEl.style.cssText = `
                font-size: 10px; padding: 4px 8px; border-radius: 6px; font-weight: 700;
                background: ${bg}; color: ${color}; white-space: nowrap; 
                overflow: hidden; text-overflow: ellipsis; border: 1px solid rgba(0,0,0,0.05);
                cursor: help;
            `;
            evEl.textContent = `${formatTime12Hour(sched.schedule_time)} ${sched.student_groups?.group_name || 'Group'}`;
            evEl.title = `${sched.schedule_type}: ${sched.student_groups?.group_name}\nVenue: ${sched.schedule_venue}`;
            container.appendChild(evEl);
        });
    }
}

// Listeners
document.getElementById('searchInput')?.addEventListener('input', applyFiltersAndRender);

function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../';
}


