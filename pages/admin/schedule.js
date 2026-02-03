// --- Supabase Configuration ---
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

// State
let allSchedules = [];
let filteredSchedules = [];
let calendarDate = new Date();

document.addEventListener('DOMContentLoaded', () => {
    loadSchedules();
});

// --- Fetch Schedules ---
async function loadSchedules() {
    try {
        const { data: schedules, error } = await supabaseClient
            .from('schedules')
            .select(`
                *,
                student_groups ( group_name, program, year_level, section, adviser )
            `)
            .order('schedule_date', { ascending: false });

        if (error) throw error;
        allSchedules = schedules;
        filteredSchedules = schedules;
        renderCalendar();

    } catch (err) {
        console.error('Error loading schedules:', err);
    }
}

function prevMonth() {
    calendarDate.setMonth(calendarDate.getMonth() - 1);
    renderCalendar();
}

function nextMonth() {
    calendarDate.setMonth(calendarDate.getMonth() + 1);
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

    // Fill empty days from previous month
    for (let i = 0; i < firstDay; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.style.cssText = 'background: white; padding: 15px; min-height: 120px; border: 1px solid #f1f5f9; color: #cbd5e1;';
        calendarDays.appendChild(emptyDay);
    }

    // Fill days of current month
    for (let day = 1; day <= daysInMonth; day++) {
        const dayEl = document.createElement('div');
        const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;

        dayEl.style.cssText = `
            background: white; 
            padding: 12px; 
            min-height: 130px; 
            border: 1px solid #f1f5f9; 
            position: relative;
        `;

        dayEl.innerHTML = `
            <div style="
                font-weight: 700; 
                color: ${isToday ? 'var(--primary-color)' : '#1e293b'}; 
                margin-bottom: 8px;
                font-size: 0.95rem;
                display: flex;
                align-items: center;
                gap: 5px;
            ">
                ${day}
                ${isToday ? '<span style="width:6px; height:6px; background:var(--primary-color); border-radius:50%;"></span>' : ''}
            </div>
            <div id="day-events-${year}-${month + 1}-${day}" style="display: flex; flex-direction: column; gap: 4px;"></div>
        `;

        calendarDays.appendChild(dayEl);

        // Find events for this day
        const dayDateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const daySchedules = filteredSchedules.filter(s => s.schedule_date === dayDateString);

        const eventsContainer = dayEl.querySelector(`#day-events-${year}-${month + 1}-${day}`);
        daySchedules.forEach(sched => {
            const eventEl = document.createElement('div');
            const typeClass = sched.schedule_type?.toLowerCase().includes('title') ? 'type-title' :
                (sched.schedule_type?.toLowerCase().includes('pre-oral') || sched.schedule_type?.toLowerCase().includes('preoral')) ? 'type-pre-oral' :
                    'type-final';

            eventEl.style.cssText = `
                font-size: 10px; 
                padding: 4px 8px; 
                border-radius: 6px; 
                font-weight: 700;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                margin-bottom: 2px;
                cursor: pointer;
                transition: transform 0.1s;
                border: 1px solid rgba(0,0,0,0.05);
            `;

            if (typeClass === 'type-title') {
                eventEl.style.background = '#dbeafe';
                eventEl.style.color = '#1e40af';
            } else if (typeClass === 'type-pre-oral') {
                eventEl.style.background = '#fef3c7';
                eventEl.style.color = '#92400e';
            } else {
                eventEl.style.background = '#dcfce7';
                eventEl.style.color = '#166534';
            }

            eventEl.textContent = `${sched.schedule_time || ''} ${sched.student_groups?.group_name || 'Group'}`;
            eventEl.title = `${sched.schedule_type}: ${sched.student_groups?.group_name}`;

            eventEl.onclick = () => openDetailsModal(sched);

            eventsContainer.appendChild(eventEl);
        });
    }
}

// --- Details Modal (Read-only) ---
function openDetailsModal(sched) {
    document.getElementById('viewGroupHeader').textContent = sched.student_groups?.group_name || 'Unknown Group';

    // Type Badge
    const typeBadge = document.getElementById('viewTypeBadge');
    typeBadge.textContent = sched.schedule_type;
    typeBadge.className = 'type-badge ' + (
        sched.schedule_type.toLowerCase().includes('title') ? 'type-title' :
            (sched.schedule_type.toLowerCase().includes('pre-oral') || sched.schedule_type.toLowerCase().includes('preoral')) ? 'type-pre-oral' :
                'type-final'
    );

    document.getElementById('viewDateTime').textContent = `${new Date(sched.schedule_date).toLocaleDateString()} at ${sched.schedule_time || 'TBA'}`;
    document.getElementById('viewVenue').textContent = sched.schedule_venue || 'TBA';
    document.getElementById('viewProgram').textContent = (sched.student_groups?.program || 'N/A').toUpperCase();
    document.getElementById('viewAdviser').textContent = sched.adviser || sched.student_groups?.adviser || 'N/A';

    // Panels
    const panelsContainer = document.getElementById('viewPanels');
    panelsContainer.innerHTML = '';
    const panels = [sched.panel1, sched.panel2, sched.panel3, sched.panel4, sched.panel5].filter(p => p);

    if (panels.length === 0) {
        panelsContainer.innerHTML = '<span style="color:#94a3b8; font-style:italic;">No panels assigned.</span>';
    } else {
        panels.forEach(p => {
            const chip = document.createElement('span');
            chip.style.cssText = `
                display: inline-block;
                padding: 6px 12px;
                background: #f1f5f9;
                color: #475569;
                font-weight: 600;
                font-size: 0.85rem;
                border-radius: 8px;
                margin-right: 5px;
                margin-bottom: 5px;
            `;
            chip.textContent = p;
            panelsContainer.appendChild(chip);
        });
    }

    document.getElementById('detailsModal').classList.add('active');
}

function closeDetailsModal() {
    document.getElementById('detailsModal').classList.remove('active');
}

// --- Filter Logic ---
function applyFilters() {
    const term = document.getElementById('searchInput').value.toLowerCase();
    const phase = document.getElementById('phaseFilter').value;

    filteredSchedules = allSchedules.filter(sched => {
        const groupName = (sched.student_groups?.group_name || '').toLowerCase();
        const program = (sched.student_groups?.program || '').toLowerCase();
        const venue = (sched.schedule_venue || '').toLowerCase();
        const type = (sched.schedule_type || '');

        const matchesSearch = groupName.includes(term) || program.includes(term) || venue.includes(term) || type.toLowerCase().includes(term);
        const matchesPhase = phase === 'All' || type === phase;

        return matchesSearch && matchesPhase;
    });

    renderCalendar();
}

document.getElementById('searchInput')?.addEventListener('input', applyFilters);
document.getElementById('phaseFilter')?.addEventListener('change', applyFilters);

// --- Logout ---
function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../';
}
