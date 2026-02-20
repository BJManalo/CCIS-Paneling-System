// instructor_schedule.js - v1.0.1 (Conflict Validation)

// --- Supabase Configuration ---
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';

// Initialize Supabase client
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

// State
let allSchedules = [];
let filteredSchedules = [];
let fetchedGroups = [];

// Helper to format time to 12-hour format
function formatTime12Hour(timeStr) {
    if (!timeStr) return '';
    // Handle HH:MM or HH:MM:SS
    const parts = timeStr.split(':');
    let hours = parseInt(parts[0], 10);
    const minutes = parts[1];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    return `${hours}:${minutes} ${ampm}`;
}

// Calendar State
let calendarDate = new Date();

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
    // Check Login
    const loginUser = JSON.parse(localStorage.getItem('loginUser'));
    const role = (loginUser && loginUser.role) ? loginUser.role.trim().toLowerCase() : '';
    const allowedRoles = ['instructor', 'instructor/adviser', 'adviser'];

    if (!loginUser || !allowedRoles.includes(role)) {
        window.location.href = '../../';
        return;
    }

    // Hide Evaluations link from nav for 'Adviser' role
    const userRole = (loginUser.role || '').trim().toLowerCase();
    if (userRole === 'adviser') {
        document.querySelectorAll('a[href*="instructor_evaluation"]').forEach(nav => {
            nav.style.setProperty('display', 'none', 'important');
        });
    }

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
                student_groups ( group_name, program, year_level, section, students (full_name) )
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
    const schedules = await getSchedules();
    allSchedules = schedules;
    filteredSchedules = schedules;
    renderCalendar();
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
            cursor: pointer; 
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
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

        dayEl.onmouseover = () => {
            dayEl.style.background = '#f8fafc';
            dayEl.style.transform = 'scale(1.02)';
            dayEl.style.zIndex = '10';
            dayEl.style.boxShadow = '0 10px 20px rgba(0,0,0,0.08)';
        };
        dayEl.onmouseout = () => {
            dayEl.style.background = 'white';
            dayEl.style.transform = 'none';
            dayEl.style.zIndex = '1';
            dayEl.style.boxShadow = 'none';
        };

        dayEl.onclick = () => {
            const formattedDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            openScheduleModalForDate(formattedDate);
        };

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
                transition: transform 0.1s;
                border: 1px solid rgba(0,0,0,0.05);
            `;

            // Re-use colors from style.css badges
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

            eventEl.textContent = `${formatTime12Hour(sched.schedule_time)} ${sched.student_groups?.group_name || 'Group'}`;
            eventEl.title = `${sched.schedule_type}: ${sched.student_groups?.group_name}`;

            eventEl.onclick = (e) => {
                e.stopPropagation();
                openEditScheduleModal(sched.id);
            };

            eventEl.onmouseenter = () => eventEl.style.transform = 'translateX(2px)';
            eventEl.onmouseleave = () => eventEl.style.transform = 'none';

            eventsContainer.appendChild(eventEl);
        });
    }
}

async function openScheduleModalForDate(date) {
    await openScheduleModal();
    const dateInput = document.getElementById('schedDate');
    if (dateInput) dateInput.value = date;
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

// --- Fetch Groups for Dropdown ---
// --- Fetch Groups and Payments for Dropdown ---
async function fetchGroupsForDropdown() {
    try {
        console.log('Fetching groups and payments for dropdown...');

        // 1. Fetch allGroups
        const { data: groups, error: groupsError } = await supabaseClient
            .from('student_groups')
            .select('*');

        if (groupsError) throw groupsError;

        // 2. Fetch allMembers (optimization: fetch once) with grades
        const { data: students, error: studentsError } = await supabaseClient
            .from('students')
            .select('*, grades(grade, grade_type)');
        if (studentsError) throw studentsError;

        // Attach members to groups
        fetchedGroups = groups.map(g => {
            const members = students.filter(s => s.group_id === g.id);
            return { ...g, members };
        });

        // 3. Fetch allPayments
        const { data: payments, error: paymentsError } = await supabaseClient
            .from('payments')
            .select('*'); // Select all to check defense_type

        if (paymentsError) throw paymentsError;
        window.allPaymentsGlobal = payments; // Store globally for filtering

        // 4. Update the dropdown based on current state
        updateGroupDropdown();

    } catch (err) {
        console.error("Error loading groups:", err);
    }
}

// --- Dynamic Dropdown Update ---
function updateGroupDropdown() {
    const select = document.getElementById('schedGroupId');
    if (!select) return;

    // Get current Defense Type from Modal
    const schedTypeRaw = document.getElementById('schedType').value;
    // Normalize type specifically handling the Pre-Oral mismatch if any
    // UI has "Pre Oral Defense", DB/Payment might have "Pre-Oral Defense"
    // We'll try to match flexibly.
    const targetType = schedTypeRaw;

    // Get Editing ID if any
    const editingId = document.getElementById('scheduleForm').getAttribute('data-editing-id');
    let currentEditingGroup = null;

    if (editingId) {
        // If editing, we know the group from the schedule we are editing
        // We find the schedule in allSchedules
        const sched = allSchedules.find(s => s.id == editingId);
        if (sched) currentEditingGroup = sched.group_id;
    }

    // Helper to normalize strings for comparison (remove hyphen, lowercase, spaces)
    const normalize = (str) => str ? str.toLowerCase().replace(/[^a-z0-9]/g, '') : '';

    // Filter Groups
    const validGroups = fetchedGroups.filter(group => {
        // Rule 1: Must have paid for this specific defense type
        const hasPayment = window.allPaymentsGlobal.some(p =>
            p.group_id == group.id &&
            normalize(p.defense_type) === normalize(targetType)
        );

        if (!hasPayment) return false;

        // Rule 2: Must NOT have an existing schedule for this defense type
        const existingSchedule = allSchedules.find(s =>
            s.group_id == group.id &&
            normalize(s.schedule_type) === normalize(targetType)
        );

        if (existingSchedule) {
            // Exception: If we are editing THIS schedule, allow it.
            if (editingId && existingSchedule.id == editingId) {
                return true;
            }
            // Otherwise, hide it because they already have one.
            return false;
        }

        // Rule 3: Sequential Prerequisite Check (Title -> Pre-Oral -> Final)
        // Groups must have been GRADED in the previous phase to be scheduled for the next.
        const checkGraded = (requiredType) => {
            // Check if ANY student in the group has a grade for the required type (Group Grade usually implies all, but lax check matches logic elsewhere)
            return group.members.some(m =>
                m.grades && m.grades.some(g => normalize(g.grade_type) === normalize(requiredType) && g.grade !== null)
            );
        };

        if (normalize(targetType).includes('preoral')) {
            // Prerequisite: Title Defense
            if (!checkGraded('Title Defense')) return false;
        } else if (normalize(targetType).includes('final')) {
            // Prerequisite: Pre-Oral Defense
            if (!checkGraded('Pre-Oral Defense') && !checkGraded('Pre Oral Defense')) return false;
        }

        return true;
    });

    // Populate Dropdown
    select.innerHTML = '<option value="">Select Group</option>';

    // If we are editing and the group got filtered out (e.g. maybe logic skew), force add it back?
    // Actually, if we are editing, validGroups should capture it via the existingSchedule check above.
    // However, if the payment was deleted? Unlikely edge case.

    validGroups.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.group_name;
        select.appendChild(option);
    });

    // If editing, ensure the current value is selected. 
    // If for some reason the group isn't valid (e.g. no payment found but schedule exists),
    // we should probably still show it to allow editing without breaking.
    if (editingId && currentEditingGroup) {
        const currentGroupInList = validGroups.find(g => g.id == currentEditingGroup);
        if (!currentGroupInList) {
            // Force add it
            const group = fetchedGroups.find(g => g.id == currentEditingGroup);
            if (group) {
                const option = document.createElement('option');
                option.value = group.id;
                option.textContent = group.group_name + " (Issue: No Payment Found)";
                select.appendChild(option);
            }
        }
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
    updateGroupDropdown();
    // After updating dropdown, the previous group selection is lost (validly so, as it might be invalid now).
    // We should clear the panels/members view too.
    handleGroupChange();
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
    document.getElementById('scheduleForm').setAttribute('data-editing-id', scheduleId);

    const { data: sched, error } = await supabaseClient
        .from('schedules')
        .select('*, student_groups(program)')
        .eq('id', scheduleId)
        .single();
    if (error) return;

    // Set Type first so updateGroupDropdown knows what to filter for
    document.getElementById('schedType').value = sched.schedule_type || 'Title Defense';

    // Now fetch groups - it will use the editing ID and Type to allow the current group
    await fetchGroupsForDropdown();

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
    document.querySelector('.modal-title').textContent = 'Edit Schedule';
    document.getElementById('scheduleModal').classList.add('active');
}

function closeScheduleModal() {
    document.getElementById('scheduleModal').classList.remove('active');
}

async function saveSchedule(e) {
    e.preventDefault();
    const editingId = document.getElementById('scheduleForm').getAttribute('data-editing-id');
    const schedule_date = document.getElementById('schedDate').value;
    const schedule_time = document.getElementById('schedTime').value;

    const scheduleData = {
        schedule_type: document.getElementById('schedType').value,
        group_id: document.getElementById('schedGroupId').value,
        panel1: document.getElementById('schedPanel1').value,
        panel2: document.getElementById('schedPanel2').value,
        panel3: document.getElementById('schedPanel3').value,
        panel4: document.getElementById('schedPanel4').value,
        panel5: document.getElementById('schedPanel5').value,
        adviser: document.getElementById('schedAdviser').value,
        schedule_date: schedule_date,
        schedule_time: schedule_time,
        schedule_venue: document.getElementById('schedVenue').value
    };

    // --- Conflict Validation ---
    const newPanels = [
        scheduleData.panel1,
        scheduleData.panel2,
        scheduleData.panel3,
        scheduleData.panel4,
        scheduleData.panel5
    ].filter(p => p && p.trim() !== "");

    const timeToMinutes = (t) => {
        if (!t) return 0;
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    };

    const newTimeMins = timeToMinutes(scheduleData.schedule_time);

    const conflict = allSchedules.find(s => {
        // Skip current record if editing
        if (editingId && s.id == editingId) return false;

        // Check date
        if (s.schedule_date === scheduleData.schedule_date) {
            const existingTimeMins = timeToMinutes(s.schedule_time);
            const diff = Math.abs(newTimeMins - existingTimeMins);

            // Conflict if scheduled within 60 minutes of each other
            if (diff < 60) {
                const existingPanels = [s.panel1, s.panel2, s.panel3, s.panel4, s.panel5].filter(p => p);
                return newPanels.some(p => existingPanels.includes(p));
            }
        }
        return false;
    });

    if (conflict) {
        const conflictingGroupName = conflict.student_groups?.group_name || 'another group';
        const overlappingPanels = newPanels.filter(p =>
            [conflict.panel1, conflict.panel2, conflict.panel3, conflict.panel4, conflict.panel5].includes(p)
        );

        showConflictModal(overlappingPanels, conflictingGroupName, scheduleData.schedule_time, scheduleData.schedule_date);
        return;
    }
    // -------------------------

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

function showConflictModal(panels, group, time, date) {
    const details = document.getElementById('conflictDetails');
    if (!details) return;

    details.innerHTML = `
        <div style="display: grid; gap: 15px;">
            <div style="display: flex; gap: 12px; align-items: flex-start;">
                <div style="background: #f1f5f9; padding: 8px; border-radius: 10px; color: #64748b;">
                    <span class="material-icons-round" style="font-size: 20px; display: block;">people</span>
                </div>
                <div>
                    <div style="font-size: 10px; text-transform: uppercase; color: #94a3b8; font-weight: 800; letter-spacing: 0.8px; margin-bottom: 2px;">Panelist(s) Affected</div>
                    <div style="color: #0f172a; font-weight: 700; line-height: 1.4;">${panels.join(', ')}</div>
                </div>
            </div>
            
            <div style="display: flex; gap: 12px; align-items: flex-start;">
                <div style="background: #f1f5f9; padding: 8px; border-radius: 10px; color: #64748b;">
                    <span class="material-icons-round" style="font-size: 20px; display: block;">groups</span>
                </div>
                <div>
                    <div style="font-size: 10px; text-transform: uppercase; color: #94a3b8; font-weight: 800; letter-spacing: 0.8px; margin-bottom: 2px;">Conflicting Group</div>
                    <div style="color: #0f172a; font-weight: 700; line-height: 1.4;">${group}</div>
                </div>
            </div>
            
            <div style="display: flex; gap: 12px; align-items: flex-start;">
                <div style="background: #f1f5f9; padding: 8px; border-radius: 10px; color: #64748b;">
                    <span class="material-icons-round" style="font-size: 20px; display: block;">schedule</span>
                </div>
                <div>
                    <div style="font-size: 10px; text-transform: uppercase; color: #94a3b8; font-weight: 800; letter-spacing: 0.8px; margin-bottom: 2px;">Date & Time</div>
                    <div style="color: #0f172a; font-weight: 700; line-height: 1.4;">${date} at ${formatTime12Hour(time)}</div>
                </div>
            </div>
        </div>
    `;
    document.getElementById('conflictModal').classList.add('active');
}

function closeConflictModal() {
    document.getElementById('conflictModal').classList.remove('active');
}

function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../';
}

