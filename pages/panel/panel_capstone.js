// panel_capstone.js
// Updated to support Page-Based Comments
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

let allData = [];
let filteredGroups = [];
let currentTab = 'Title Defense'; // Default
let currentProgram = 'ALL';
let searchTerm = '';
let groupGrades = {}; // Map: groupId -> Set of graded/evaluated types
let currentStatusFilter = 'ALL';

let currentRole = 'Panel'; // Default

document.addEventListener('DOMContentLoaded', () => {
    loadCapstoneData();
});

// --- Role Switching ---
window.switchRole = (role) => {
    currentRole = role;

    // Update active buttons
    document.querySelectorAll('.role-filter-btn').forEach(btn => {
        if (btn.id === `role-${role}`) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    renderTable();
};

// Normalize helper (lowercase, remove hyphens/spaces)
function normalizeType(str) {
    if (!str) return '';
    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function loadCapstoneData() {
    const tableBody = document.getElementById('tableBody');
    const emptyState = document.getElementById('emptyState');

    // Get logged in user checking
    const userJson = localStorage.getItem('loginUser');
    if (!userJson) {
        window.location.href = '../../';
        return;
    }
    const user = JSON.parse(userJson);

    tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 40px;">Loading capstone data...</td></tr>';
    if (emptyState) emptyState.style.display = 'none';

    try {
        // 1. Fetch Student Groups (with status columns)
        const { data: groups, error: gError } = await supabaseClient
            .from('student_groups')
            .select('*');

        if (gError) throw gError;

        // 2. Fetch Schedules (to map defense types)
        const { data: schedules, error: sError } = await supabaseClient
            .from('schedules')
            .select('*');

        if (sError) throw sError;

        // 3. Fetch Grades/Evaluations (For sequential Locking)
        // We need to know if THIS user (Panel) has evaluated the group for a specific stage.
        // Assuming 'grades' table links students to grades.
        // We need to fetch students first to map group_id.
        const { data: students, error: stdError } = await supabaseClient
            .from('students')
            .select('id, group_id');

        if (stdError) throw stdError;

        const studentIds = students.map(s => s.id);

        // Fetch grades for these students
        // Ideally we filter by grader, but if schema doesn't support it, we check if *any* grade exists for the group.
        // Constraint: The prompt says "until THEY evaluated".
        // If we can't track "THEY", we'll check global status or assume any grade counts.
        // For MVP, we check if there is a grade for the group's students for the required type.
        const { data: grades, error: grError } = await supabaseClient
            .from('grades')
            .select('student_id, grade_type')
            .in('student_id', studentIds);

        if (grError) throw grError;

        // Build Group Grades Map
        groupGrades = {};
        grades.forEach(g => {
            const student = students.find(s => s.id === g.student_id);
            if (student) {
                if (!groupGrades[student.group_id]) groupGrades[student.group_id] = new Set();
                groupGrades[student.group_id].add(normalizeType(g.grade_type));
            }
        });

        // 4. Fetch Defense Statuses
        const { data: defStatuses, error: dsError } = await supabaseClient
            .from('defense_statuses')
            .select('*');

        if (dsError) throw dsError;

        // 5. Process Data
        allData = [];

        // Defined defense types to check for
        const defenseTypes = ['Title Defense', 'Pre-Oral Defense', 'Final Defense'];

        groups.forEach(group => {
            // Check each defense type for this group
            defenseTypes.forEach(defType => {
                const normType = normalizeType(defType);

                // 1. Check for existing schedule
                // We use find because typically one active schedule per type. 
                // If multiple exist, we might just take the first one or logic needs expansion.
                // Original logic used filter but usually 1:1.
                const sched = schedules.find(s => s.group_id === group.id && normalizeType(s.schedule_type) === normType);

                // 2. Check for files
                let hasFiles = false;
                let filesObj = {};
                try {
                    filesObj = {
                        titles: group.title_link ? JSON.parse(group.title_link) : {},
                        pre_oral: group.pre_oral_link ? JSON.parse(group.pre_oral_link) : {},
                        final: group.final_link ? JSON.parse(group.final_link) : {}
                    };
                } catch (e) { console.error('JSON Parse error', e); }

                if (normType.includes('title') && Object.keys(filesObj.titles).length > 0) hasFiles = true;
                else if (normType.includes('preoral') && Object.keys(filesObj.pre_oral).length > 0) hasFiles = true;
                else if (normType.includes('final') && Object.keys(filesObj.final).length > 0) hasFiles = true;

                // 3. Skip if neither schedule nor files exist
                if (!sched && !hasFiles) return;

                // 4. Construct Data Object
                // 4. Construct Data Object
                const isAdviser = group.adviser === user.name;

                let panelList = [];
                if (sched) {
                    panelList = [sched.panel1, sched.panel2, sched.panel3, sched.panel4, sched.panel5].filter(p => p);
                } else {
                    // Fallback: If no schedule for this specific defense, check ALL schedules for this group
                    // to see if user is a panelist in any of them (e.g. was panel in Title Defense, so is likely panel for Final)
                    const allGroupSchedules = schedules.filter(s => s.group_id === group.id);
                    const allPanels = new Set();
                    allGroupSchedules.forEach(s => {
                        [s.panel1, s.panel2, s.panel3, s.panel4, s.panel5].forEach(p => {
                            if (p) allPanels.add(p);
                        });
                    });
                    panelList = Array.from(allPanels);
                }

                const isPanelist = panelList.includes(user.name);

                // Find matching defense status row
                const statusRow = defStatuses.find(ds => ds.group_id === group.id && normalizeType(ds.defense_type) === normType);
                const currentStatuses = statusRow ? (statusRow.statuses || {}) : {};
                const currentRemarks = statusRow ? (statusRow.remarks || {}) : {};

                let titleStatus = {}, preOralStatus = {}, finalStatus = {};
                if (normType.includes('title')) titleStatus = currentStatuses;
                else if (normType.includes('preoral')) preOralStatus = currentStatuses;
                else if (normType.includes('final')) finalStatus = currentStatuses;

                let titleRemarks = {}, preOralRemarks = {}, finalRemarks = {};
                if (normType.includes('title')) titleRemarks = currentRemarks;
                else if (normType.includes('preoral')) preOralRemarks = currentRemarks;
                else if (normType.includes('final')) finalRemarks = currentRemarks;

                allData.push({
                    id: group.id,
                    type: sched ? sched.schedule_type : defType, // Use specific type string from loop if no schedule
                    normalizedType: normType,
                    groupName: group.group_name,
                    program: (group.program || '').toUpperCase(),
                    date: sched ? sched.schedule_date : null,
                    time: sched ? sched.schedule_time : null,
                    venue: sched ? sched.schedule_venue : 'Online / TBA', // Default if no schedule
                    panels: panelList,
                    files: filesObj,

                    // Unified accessors
                    titleStatus, preOralStatus, finalStatus,
                    titleRemarks, preOralRemarks, finalRemarks,

                    // Store raw status info for updates
                    defenseStatusId: statusRow ? statusRow.id : null,
                    currentStatusJson: currentStatuses,
                    currentRemarksJson: currentRemarks,

                    status: sched ? (sched.status || 'Active') : 'Pending Schedule',
                    isAdviser: isAdviser,
                    isPanelist: isPanelist
                });
            });
        });

        renderTable();

    } catch (err) {
        console.error('Error loading data:', err);
        tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 40px; color: red;">Error loading data.</td></tr>';
    }
}

// --- Tab Switching ---
window.switchTab = (tabName) => {
    currentTab = tabName;
    updateTabStyles(tabName);
    renderTable();
};

function updateTabStyles(activeTab) {
    document.querySelectorAll('.role-tab').forEach(tab => {
        const tabId = tab.id.replace('tab-', '');
        if (tabId === activeTab) {
            tab.classList.add('active');
            tab.style.color = 'var(--primary-color)';
            tab.style.borderBottomColor = 'var(--primary-color)';
        } else {
            tab.classList.remove('active');
            tab.style.color = '#64748b';
            tab.style.borderBottomColor = 'transparent';
        }
    });
}

window.filterStatus = (status) => {
    currentStatusFilter = status;
    document.querySelectorAll('.status-btn').forEach(btn => {
        if (btn.id === `status-${status}`) {
            btn.style.opacity = '1';
            btn.style.transform = 'scale(1.05)';
        } else {
            btn.style.opacity = '0.5';
            btn.style.transform = 'scale(1)';
        }
    });
    renderTable();
};

function renderTable() {
    const tableBody = document.getElementById('tableBody');
    const emptyState = document.getElementById('emptyState');
    tableBody.innerHTML = '';

    const userJson = localStorage.getItem('loginUser');
    const user = userJson ? JSON.parse(userJson) : null;
    const userName = user ? (user.name || user.full_name || 'Panel') : 'Panel';

    const normCurrentTab = normalizeType(currentTab);

    // Filter
    filteredGroups = allData.filter(g => {
        // Tab Match (Defense Type)
        const typeMatch = normalizeType(g.type) === normCurrentTab;

        // Program Match
        const programMatch = currentProgram === 'ALL' || g.program === currentProgram;

        // Search Match
        const searchMatch = !searchTerm ||
            g.groupName.toLowerCase().includes(searchTerm.toLowerCase());

        // Role Match
        // Role Match
        const roleMatch = (currentRole === 'Panel' && g.isPanelist) ||
            (currentRole === 'Adviser' && g.isAdviser);

        if (!typeMatch || !programMatch || !searchMatch || !roleMatch) return false;

        // --- Finished/Unfinished Filter Logic ---
        if (currentStatusFilter === 'ALL') return true;

        let currentFileSet = {};
        if (normCurrentTab.includes('title')) currentFileSet = g.files.titles;
        else if (normCurrentTab.includes('preoral')) currentFileSet = g.files.pre_oral;
        else if (normCurrentTab.includes('final')) currentFileSet = g.files.final;

        const fileKeys = Object.keys(currentFileSet);
        let isFinished = false;

        if (fileKeys.length === 0) {
            isFinished = false; // Blank student submissions are NOT finished
        } else {
            const statuses = g.currentStatusJson || {};
            const remarks = g.currentRemarksJson || {};

            if (currentRole === 'Panel') {
                // For Panelists: Finished if THEY have evaluated all files
                isFinished = fileKeys.every(key => {
                    const s = statuses[key]?.[userName] || 'Pending';
                    const r = remarks[key]?.[userName] || '';
                    return s !== 'Pending' && r.trim() !== '';
                });
            } else {
                // For Advisers: Finished if ALL panelists assigned have evaluated all files
                const panels = g.panels || [];
                if (panels.length === 0) {
                    isFinished = false;
                } else {
                    isFinished = panels.every(pName => {
                        return fileKeys.every(key => {
                            const s = statuses[key]?.[pName] || 'Pending';
                            const r = remarks[key]?.[pName] || '';
                            return s !== 'Pending' && r.trim() !== '';
                        });
                    });
                }
            }
        }

        return currentStatusFilter === 'FINISHED' ? isFinished : !isFinished;
    });

    if (filteredGroups.length === 0) {
        if (emptyState) emptyState.style.display = 'flex';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    filteredGroups.forEach(g => {
        // --- LOCKING LOGIC ---
        let isLocked = false;
        let lockReason = '';
        const userEvaluations = groupGrades[g.id] || new Set();

        if (normCurrentTab === normalizeType('Pre-Oral Defense')) {
            // Must have evaluated Title Defense
            if (!userEvaluations.has(normalizeType('Title Defense'))) {
                isLocked = true;
                lockReason = 'Evaluate Title Defense first';
            }
        } else if (normCurrentTab === normalizeType('Final Defense')) {
            // Must have evaluated Pre-Oral Defense
            if (!userEvaluations.has(normalizeType('Pre-Oral Defense'))) {
                isLocked = true;
                lockReason = 'Evaluate Pre-Oral first';
            }
        }

        const dateStr = g.date ? new Date(g.date).toLocaleDateString() : '-';

        // Panels Chips
        const panelList = g.panels && g.panels.length > 0 ? g.panels : [];
        const panelsHtml = panelList.map(p => `<span class="chip">${p}</span>`).join('');

        // Using standard badges
        const program = (g.program || '').toUpperCase();
        let progClass = 'prog-unknown';
        if (program.includes('BSIS')) progClass = 'prog-bsis';
        else if (program.includes('BSIT')) progClass = 'prog-bsit';
        else if (program.includes('BSCS')) progClass = 'prog-bscs';

        let typeClass = 'type-unknown';
        const lowerType = g.type.toLowerCase();
        if (lowerType.includes('title')) typeClass = 'type-title';
        else if (lowerType.includes('pre-oral') || lowerType.includes('preoral')) typeClass = 'type-pre-oral';
        else if (lowerType.includes('final')) typeClass = 'type-final';

        // Define which file set corresponds to current tab for button context
        let currentFileSet = {};
        if (normCurrentTab.includes('title')) currentFileSet = g.files.titles;
        else if (normCurrentTab.includes('preoral')) currentFileSet = g.files.pre_oral;
        else if (normCurrentTab.includes('final')) currentFileSet = g.files.final;

        const hasFiles = Object.keys(currentFileSet).length > 0;

        const row = document.createElement('tr');

        let actionBtn = '';
        if (isLocked) {
            actionBtn = `
                <div style="display: flex; flex-direction: column; align-items: flex-start;">
                    <button disabled style="background: #f1f5f9; color: #94a3b8; border: none; padding: 6px 12px; border-radius: 6px; cursor: not-allowed; display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600;">
                        <span class="material-icons-round" style="font-size: 16px;">lock</span>
                        Locked
                    </button>
                    <span style="font-size: 10px; color: #ef4444; margin-top: 2px;">${lockReason}</span>
                </div>
             `;
            row.style.background = '#fafafa';
        } else {
            actionBtn = `
                <button onclick="${hasFiles ? `openFileModal(${g.id})` : ''}" 
                    style="background: ${hasFiles ? 'var(--primary-light)' : '#f1f5f9'}; opacity: ${hasFiles ? '1' : '0.6'}; border: none; color: ${hasFiles ? 'var(--primary-color)' : '#94a3b8'}; cursor: ${hasFiles ? 'pointer' : 'default'}; display: flex; align-items: center; gap: 5px; padding: 6px 12px; border-radius: 6px; transition: all 0.2s;">
                    <span class="material-icons-round" style="font-size: 18px;">${hasFiles ? 'folder_open' : 'folder_off'}</span>
                    <span style="font-size: 12px; font-weight: 600;">${hasFiles ? 'View Files' : 'No Files'}</span>
                </button>
             `;
        }

        row.innerHTML = `
            <td><span class="type-badge ${typeClass}">${g.type}</span></td>
            <td>
                <div style="font-weight: 600;">${g.groupName}</div>
                <div style="font-size: 12px; color: #64748b; margin-top: 2px;">${g.isAdviser ? 'Adviser View' : 'Panel View'}</div>
            </td>
            <td><span class="prog-badge ${progClass}">${program}</span></td>
            <td>
                <div style="font-weight: 500;">${dateStr}</div>
                <div style="font-size: 11px; color: #64748b;">${g.time || ''}</div>
            </td>
            <td>
                <div style="display: flex; align-items: center; gap: 4px; color: #475569;">
                    <span class="material-icons-round" style="font-size: 14px; color: var(--primary-color);">place</span>
                    ${g.venue || 'TBA'}
                </div>
            </td>
            <td>
                <div class="chips-container">
                    ${panelsHtml || '<span style="color:#94a3b8; font-style:italic; font-size:11px;">Not Assigned</span>'}
                </div>
            </td>
            <td>${actionBtn}</td>
        `;

        tableBody.appendChild(row);
    });
}

// Global functions for Modal (Reusing existing logic roughly, but checking context)
// Global functions for Modal (Reusing existing logic roughly, but checking context)
window.openFileModal = (groupId) => {
    // FIX: Find group matching ID AND the current active tab (Defense Type)
    // This ensures we get the correct object (Title, Pre, or Final) from allData
    const normTab = normalizeType(currentTab);
    const group = allData.find(g => g.id === groupId && normalizeType(g.type) === normTab);

    if (!group) {
        console.error('Group not found for this tab context');
        return;
    }

    document.getElementById('modalGroupName').innerText = group.groupName;
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '';

    // reset viewer
    document.getElementById('fileViewer').style.display = 'none';
    document.getElementById('viewerPlaceholder').style.display = 'flex';
    document.getElementById('viewerToolbar').style.display = 'none';

    // Helper to create sections
    const createSection = (sectionTitle, fileObj, icon, categoryKey) => {
        if (!fileObj || Object.keys(fileObj).length === 0) return;

        const section = document.createElement('div');
        section.style.marginBottom = '20px';

        const header = document.createElement('h4');
        header.innerHTML = `<span class="material-icons-round" style="font-size:16px; vertical-align:middle; margin-right:4px;">${icon}</span> ${sectionTitle}`;
        header.style.fontSize = '0.85rem';
        header.style.textTransform = 'uppercase';
        header.style.color = '#64748b';
        header.style.letterSpacing = '0.5px';
        header.style.marginBottom = '10px';
        section.appendChild(header);

        Object.entries(fileObj).forEach(([label, url]) => {
            const itemContainer = document.createElement('div');
            itemContainer.style.background = 'white';
            itemContainer.style.border = '1px solid #e2e8f0';
            itemContainer.style.borderRadius = '8px';
            itemContainer.style.marginBottom = '8px';
            itemContainer.style.overflow = 'hidden';

            // File Item
            const item = document.createElement('div');
            item.className = 'file-item';
            item.style.padding = '10px 12px';
            item.style.cursor = 'pointer';
            item.style.display = 'flex';
            item.style.alignItems = 'center';
            item.style.justifyContent = 'space-between';
            item.style.transition = 'all 0.2s';

            const displayLabel = label.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());

            item.innerHTML = `
                <span style="font-size: 0.9rem; font-weight: 500; color: #334155;">${displayLabel}</span>
                <span class="material-icons-round" style="font-size: 18px; color: var(--primary-color);">arrow_forward_ios</span>
            `;

            item.onclick = () => {
                document.querySelectorAll('.file-item').forEach(el => {
                    el.style.background = 'white';
                    el.parentElement.style.borderColor = '#e2e8f0';
                });
                item.style.background = '#f0f9ff';
                itemContainer.style.borderColor = 'var(--primary-color)';

                // Set Context & Load
                setPdfContext(group.id, categoryKey, label, group);
                loadViewer(url);
            };

            itemContainer.appendChild(item);

            // Approval Controls logic (same as before)
            // ... (We assume the status/remarks update logic remains valid)
            // Re-implement simplified version here to save space or reuse if function available

            // To ensure it works, I'll inject the controls logic directly again (safest)
            const userJson = localStorage.getItem('loginUser');
            const user = userJson ? JSON.parse(userJson) : null;
            const userName = user ? (user.name || user.full_name || 'Panel') : 'Panel';

            let currentStatusMap = {};
            let currentRemarksMap = {};

            if (categoryKey === 'titles') {
                currentStatusMap = group.titleStatus || {};
                currentRemarksMap = group.titleRemarks || {};
            } else if (categoryKey === 'pre_oral') {
                currentStatusMap = group.preOralStatus || {};
                currentRemarksMap = group.preOralRemarks || {};
            } else if (categoryKey === 'final') {
                currentStatusMap = group.finalStatus || {};
                currentRemarksMap = group.finalRemarks || {};
            }

            // --- Multi-Panel Logic ---
            // If the map value is a string (old version), we ignore it for multi-panel or try to adapt.
            // New structure: currentStatusMap[label] = { "Panel Name": "Status" }
            const fileStatuses = typeof currentStatusMap[label] === 'object' ? currentStatusMap[label] : {};
            const fileRemarks = typeof currentRemarksMap[label] === 'object' ? currentRemarksMap[label] : {};

            const myStatus = fileStatuses[userName] || 'Pending';
            const myRemarks = fileRemarks[userName] || '';

            // ... (Controls Rendering Code) ...
            const controls = document.createElement('div');
            controls.style.padding = '12px';
            controls.style.background = '#f8fafc';
            controls.style.borderTop = '1px solid #e2e8f0';
            controls.style.display = 'flex';
            controls.style.flexDirection = 'column';
            controls.style.gap = '8px';

            let statusColor = '#64748b';
            let statusBg = '#f1f5f9';
            let iconText = 'hourglass_empty';

            if (myStatus.includes('Approved')) {
                statusColor = '#059669'; statusBg = '#dcfce7'; iconText = 'check_circle';
            } else if (myStatus.includes('Approve with Revisions')) {
                statusColor = '#d97706'; statusBg = '#fef3c7'; iconText = 'warning';
            } else if (myStatus.includes('Rejected') || myStatus.includes('Redefense')) {
                statusColor = '#dc2626'; statusBg = '#fee2e2'; iconText = 'cancel';
            }

            let optionsHtml = '';
            // ... (option generation omitted for brevity if not used in read-only)

            if (categoryKey === 'titles') {
                optionsHtml = `
                    <option value="Approved" ${myStatus === 'Approved' ? 'selected' : ''}>Approve</option>
                    <option value="Approve with Revisions" ${myStatus === 'Approve with Revisions' ? 'selected' : ''}>Approve w/ Revisions</option>
                    <option value="Rejected" ${myStatus === 'Rejected' ? 'selected' : ''}>Reject</option>
                `;
            } else {
                optionsHtml = `
                    <option value="Approved" ${myStatus === 'Approved' ? 'selected' : ''}>Approve</option>
                    <option value="Approve with Revisions" ${myStatus === 'Approve with Revisions' ? 'selected' : ''}>Approve w/ Revisions</option>
                    <option value="Redefense" ${myStatus === 'Redefense' ? 'selected' : ''}>Redefense</option>
                `;
            }

            // Other Panel Feedback HTML (Visible to everyone)
            let otherFeedbackHtml = '';
            // For Adviser, we want to see ALL panel feedback, not just "others".
            // Since Adviser name isn't in the status map as a KEY usually (unless they are also a panel), 
            // "others" logic works fine if we consider Adviser is not a panel key.
            // But if currentRole is Adviser, we want to see ALL entries in fileStatuses.

            let panelsToDisplay = [];
            if (currentRole === 'Adviser') {
                panelsToDisplay = Object.keys(fileStatuses);
            } else {
                panelsToDisplay = Object.keys(fileStatuses).filter(p => p !== userName);
            }

            if (panelsToDisplay.length > 0) {
                otherFeedbackHtml = `
                    <div style="margin-top: 15px; border-top: 1px dashed #e2e8f0; padding-top: 15px;">
                        <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 10px; letter-spacing: 0.5px;">Panel Evaluations</div>
                        ${panelsToDisplay.map(panel => {
                    let comments = [];
                    const rawRem = fileRemarks[panel] || '';
                    try {
                        comments = JSON.parse(rawRem);
                        if (!Array.isArray(comments)) throw new Error();
                    } catch (e) {
                        if (rawRem) comments = [{ page: 'General', text: rawRem.replace(new RegExp(`^${panel}:\\s*`), '') }];
                    }

                    const commentsHtml = comments.map(c => `
                                <div style="font-size: 11px; margin-bottom: 4px; padding-left: 8px; border-left: 2px solid #cbd5e1;">
                                    ${c.page && c.page !== 'General' ? `<span style="font-weight:600; color:#475569; background:#f1f5f9; padding:1px 4px; border-radius:4px; margin-right:4px;">Pg ${c.page}</span>` : ''}
                                    <span style="color: #64748b;">${c.text}</span>
                                </div>
                             `).join('');

                    return `
                            <div style="font-size: 11px; margin-bottom: 12px; color: #475569;">
                                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                    <strong style="color: var(--primary-color);">${panel}</strong>
                                    <span class="status-badge" style="font-size:10px; padding:2px 6px; ${fileStatuses[panel]?.includes('Approved') ? 'background:#dcfce7; color:#166534;' : 'background:#f1f5f9; color:#64748b;'}">${fileStatuses[panel] || 'Pending'}</span>
                                </div>
                                ${commentsHtml || '<span style="font-style:italic; color:#94a3b8;">No remarks</span>'}
                            </div>
                        `;
                }).join('')}
                    </div>
                `;
            }

            let interactiveControls = '';
            if (currentRole === 'Panel') {

                // Parse my existing comments
                let myComments = [];
                try {
                    const parsed = JSON.parse(myRemarks);
                    if (Array.isArray(parsed)) myComments = parsed;
                    else if (myRemarks) myComments = [{ id: Date.now(), page: 'General', text: myRemarks.replace(new RegExp(`^${userName}:\\s*`), ''), date: new Date().toISOString() }];
                } catch (e) {
                    if (myRemarks) myComments = [{ id: Date.now(), page: 'General', text: myRemarks.replace(new RegExp(`^${userName}:\\s*`), ''), date: new Date().toISOString() }];
                }

                // Render Comments List HTML
                const commentsListHtml = myComments.map((c, idx) => `
                    <div style="background: white; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; margin-bottom: 6px; position: relative;">
                         <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
                            <span style="font-size: 10px; font-weight: 700; color: #475569; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">
                                ${c.page === 'General' || !c.page ? 'General' : `Page ${c.page}`}
                            </span>
                            <button onclick="deletePageRemark(${group.id}, '${categoryKey}', '${label}', ${idx})" style="background:none; border:none; cursor:pointer; color:#ef4444; padding:0;">
                                <span class="material-icons-round" style="font-size:14px;">close</span>
                            </button>
                         </div>
                         <div style="font-size: 12px; color: #334155; line-height: 1.4;">${c.text}</div>
                    </div>
                `).join('');

                interactiveControls = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px;">Your Status</span>
                    <div style="font-size: 12px; font-weight: 700; color: ${statusColor}; background: ${statusBg}; padding: 4px 8px; border-radius: 99px; display: flex; align-items: center; gap: 4px;">
                        <span class="material-icons-round" style="font-size: 14px;">${iconText}</span>
                        ${myStatus}
                    </div>
                </div>
                <select onchange="updateStatus(${group.id}, '${categoryKey}', '${label}', this.value)" 
                    style="width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 13px; cursor: pointer; background: white; color: #334155; font-weight: 500; outline: none; margin-bottom: 15px;">
                    <option value="Pending" ${myStatus === 'Pending' ? 'selected' : ''}>Change Your Status...</option>
                    ${optionsHtml}
                </select>

                <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 10px; margin-bottom: 15px;">
                    <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 8px;">Add Info</div>
                    <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                         <input type="text" id="page-${categoryKey}-${label}" placeholder="Pg #" style="width: 50px; padding: 6px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 12px; text-align: center;">
                         <input type="text" id="new-comment-${categoryKey}-${label}" placeholder="Type your comment/correction here..." style="flex: 1; padding: 6px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 12px;">
                    </div>
                    <button onclick="addPageRemark(${group.id}, '${categoryKey}', '${label}')" 
                        style="width: 100%; background: var(--primary-color); color: white; border: none; padding: 6px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
                        <span class="material-icons-round" style="font-size: 14px;">add</span> Add Comment
                    </button>
                </div>

                <div style="max-height: 200px; overflow-y: auto;">
                    ${commentsListHtml || '<div style="text-align:center; font-size:11px; color:#94a3b8; padding:10px;">No comments yet</div>'}
                </div>
                `;
            } else {
                // Adviser View (Read Only)
                interactiveControls = `
                    <div style="padding: 8px; background: #f0f9ff; border: 1px dashed #bae6fd; border-radius: 6px; color: #0369a1; font-size: 12px; font-weight: 500; text-align: center; margin-bottom: 10px;">
                        <span class="material-icons-round" style="font-size: 14px; vertical-align: middle; margin-right: 4px;">visibility</span>
                        Viewing as Adviser (Read Only)
                    </div>
                `;
            }

            controls.innerHTML = `
                ${interactiveControls}
                ${otherFeedbackHtml}
            `;
            itemContainer.appendChild(controls);
            section.appendChild(itemContainer);
        });

        fileList.appendChild(section);
    };

    // Filter which sections to show based on locking/tab? 
    // Usually if I open the "Title Defense" group row, I might want to see ONLY Title files?
    // Or see all history?
    // Let's show ONLY the current tab's files to be focused. 
    // Or allow seeing previous approved ones?
    // Generally, context is "grading this stage".
    // I will show ALL for context, but maybe collapse others?
    // For simplicity, showing all is safer so they can reference previous docs.

    if (normTab.includes('title')) {
        createSection('Title Defense', group.files.titles, 'article', 'titles');
    } else if (normTab.includes('preoral')) {
        createSection('Pre-Oral Defense', group.files.pre_oral, 'description', 'pre_oral');
    } else if (normTab.includes('final')) {
        createSection('Final Defense', group.files.final, 'menu_book', 'final');
    }

    document.getElementById('fileModal').style.display = 'flex';
};

// Re-attach other globals (updateStatus, saveRemarks, loadViewer, etc.)
// They remain largely checking 'allData' which we update.
// NOTE: I am keeping them as defined in previous file version but ensuring they use the new data structure.

window.updateStatus = async (groupId, categoryKey, fileKey, newStatus) => {
    if (newStatus === 'Pending') return;
    try {
        const normTab = normalizeType(currentTab);
        const group = allData.find(g => g.id === groupId && normalizeType(g.type) === normTab);
        if (!group) {
            console.error('Group not found for status update in this tab context.');
            return;
        }

        const userJson = localStorage.getItem('loginUser');
        const user = userJson ? JSON.parse(userJson) : null;
        const userName = user ? (user.name || user.full_name || 'Panel') : 'Panel';

        let defenseType = group.type;

        let localMap = group.currentStatusJson || {};

        // Multi-panel structure: {"title1": {"Panel A": "Approved" } }
        if (typeof localMap[fileKey] !== 'object') {
            localMap[fileKey] = {}; // Transition to new structure
        }
        localMap[fileKey][userName] = newStatus;

        const payload = {
            group_id: groupId,
            defense_type: defenseType,
            statuses: localMap,
            remarks: group.currentRemarksJson || {}
        };

        let error;
        if (group.defenseStatusId) {
            const result = await supabaseClient.from('defense_statuses')
                .update({ statuses: localMap, updated_at: new Date() })
                .eq('id', group.defenseStatusId);
            error = result.error;
        } else {
            const result = await supabaseClient.from('defense_statuses')
                .insert([payload])
                .select();
            error = result.error;
            if (result.data) group.defenseStatusId = result.data[0].id;
        }

        if (error) throw error;

        group.currentStatusJson = localMap;
        if (categoryKey === 'titles') group.titleStatus = localMap;
        else if (categoryKey === 'pre_oral') group.preOralStatus = localMap;
        else if (categoryKey === 'final') group.finalStatus = localMap;

        openFileModal(groupId);
    } catch (err) { console.error(err); alert('Failed to update status: ' + (err.message || err)); }
};

window.addPageRemark = async (groupId, categoryKey, fileKey) => {
    const userJson = localStorage.getItem('loginUser');
    if (!userJson) return;
    const user = JSON.parse(userJson);
    const userName = user.name || 'Panel';

    const pageInput = document.getElementById(`page-${categoryKey}-${fileKey}`);
    const textInput = document.getElementById(`new-comment-${categoryKey}-${fileKey}`);

    const pageVal = pageInput.value.trim();
    const textVal = textInput.value.trim();

    if (!textVal) return; // Empty comment check

    // Find Group
    const normTab = normalizeType(currentTab);
    const group = allData.find(g => g.id === groupId && normalizeType(g.type) === normTab);
    if (!group) return;

    // Get Existing Remarks JSON
    let localMap = group.currentRemarksJson || {};
    let myRaw = localMap[fileKey]?.[userName] || '';

    let myComments = [];
    try {
        const parsed = JSON.parse(myRaw);
        if (Array.isArray(parsed)) myComments = parsed;
        else if (myRaw) myComments = [{ id: Date.now(), page: 'General', text: myRaw.replace(new RegExp(`^${userName}:\\s*`), ''), date: new Date().toISOString() }];
    } catch (e) {
        if (myRaw) myComments = [{ id: Date.now(), page: 'General', text: myRaw.replace(new RegExp(`^${userName}:\\s*`), ''), date: new Date().toISOString() }];
    }

    // Add New Comment
    myComments.push({
        id: Date.now(),
        page: pageVal || 'General',
        text: textVal,
        date: new Date().toISOString()
    });

    // Save
    await saveCommentsMap(group, categoryKey, fileKey, userName, myComments);

    // Clear inputs
    textInput.value = '';
    pageInput.value = '';
};

window.deletePageRemark = async (groupId, categoryKey, fileKey, index) => {
    const userJson = localStorage.getItem('loginUser');
    if (!userJson) return;
    const user = JSON.parse(userJson);
    const userName = user.name || 'Panel';

    const normTab = normalizeType(currentTab);
    const group = allData.find(g => g.id === groupId && normalizeType(g.type) === normTab);
    if (!group) return;

    let localMap = group.currentRemarksJson || {};
    let myRaw = localMap[fileKey]?.[userName] || '';

    let myComments = [];
    try {
        const parsed = JSON.parse(myRaw);
        if (Array.isArray(parsed)) myComments = parsed;
    } catch (e) { return; } // Can't delete from legacy string cleanly without parsing first, but we assume it's array now

    if (index >= 0 && index < myComments.length) {
        myComments.splice(index, 1);
        await saveCommentsMap(group, categoryKey, fileKey, userName, myComments);
    }
};

async function saveCommentsMap(group, categoryKey, fileKey, userName, commentsArray) {
    let localMap = group.currentRemarksJson || {};
    if (typeof localMap[fileKey] !== 'object') localMap[fileKey] = {}; // safety

    // Convert back to JSON string
    localMap[fileKey][userName] = JSON.stringify(commentsArray);

    let defenseType = group.type;

    try {
        let error;
        if (group.defenseStatusId) {
            const result = await supabaseClient.from('defense_statuses')
                .update({ remarks: localMap, updated_at: new Date() })
                .eq('id', group.defenseStatusId);
            error = result.error;
        } else {
            const payload = {
                group_id: group.id,
                defense_type: defenseType,
                statuses: group.currentStatusJson || {},
                remarks: localMap
            };
            const result = await supabaseClient.from('defense_statuses')
                .insert([payload])
                .select();
            error = result.error;
            if (result.data) group.defenseStatusId = result.data[0].id;
        }

        if (error) throw error;

        // Update local data
        group.currentRemarksJson = localMap;
        if (categoryKey === 'titles') group.titleRemarks = localMap;
        else if (categoryKey === 'pre_oral') group.preOralRemarks = localMap;
        else if (categoryKey === 'final') group.finalRemarks = localMap;

        // RE-RENDER MODAL to show list
        openFileModal(group.id);

    } catch (e) { console.error('Save error', e); alert('Error saving comment: ' + e.message); }
}

window.closeFileModal = () => {
    document.getElementById('fileModal').style.display = 'none';
    document.getElementById('fileViewer').src = '';
};

// --- PDF.js Logic for Annotation ---
let pdfDoc = null;
let pdfScale = 1.2;
let isDrawing = false;
let startX, startY;
let currentRectDiv = null;
let currentPdfParams = {}; // Store current file context

window.loadViewer = async (url) => {
    if (!url) return;

    // Reset Views
    const pdfContainer = document.getElementById('pdfContainer');
    const fileViewer = document.getElementById('fileViewer');
    const placeholder = document.getElementById('viewerPlaceholder');
    const toolbar = document.getElementById('viewerToolbar');
    const sidebar = document.getElementById('commentsSidebar');
    const extBtn = document.getElementById('externalLinkBtn');
    const annotList = document.getElementById('annotationList');

    fileViewer.style.display = 'none';
    pdfContainer.innerHTML = '';
    pdfContainer.style.display = 'none';
    placeholder.style.display = 'none';
    toolbar.style.display = 'flex';
    sidebar.style.display = 'none';
    extBtn.href = url;

    // --- DETECT FILE TYPE ---
    const cleanUrl = url.split('?')[0].toLowerCase();
    const isDrive = url.includes('drive.google.com');
    const isOffice = cleanUrl.match(/\.(doc|docx|ppt|pptx|xls|xlsx|txt)$/i);
    const isGoogleSuite = url.includes('docs.google.com') || url.includes('sheets.google.com') || url.includes('slides.google.com');

    // We only try custom rendering if it LOOKS like a direct PDF and is NOT Drive/Office.
    // This prevents the CORS errors for Drive links.
    const shouldTryRender = cleanUrl.endsWith('.pdf') && !isDrive;

    // --- SETUP SIDEBAR (Manual Input) ---
    // We ALWAYS show this form now, so users can add comments even if drawing fails or is impossible (Drive).
    sidebar.style.display = 'flex';
    annotList.innerHTML = '';

    // Create or Reuse header
    const existingHeader = document.getElementById('sidebar-add-form');
    if (existingHeader) existingHeader.remove();

    const sidebarHeader = document.createElement('div');
    sidebarHeader.id = 'sidebar-add-form';
    sidebarHeader.style.padding = '15px';
    sidebarHeader.style.borderBottom = '1px solid #e2e8f0';
    sidebarHeader.style.background = '#f8fafc';
    sidebarHeader.innerHTML = `
        <div style="font-size:11px; font-weight:700; color:#64748b; margin-bottom:8px; text-transform:uppercase;">Add Comment</div>
        <div style="display:flex; gap:5px; margin-bottom:8px;">
            <input type="text" id="manual-page" placeholder="Pg" style="width:40px; padding:6px; border:1px solid #cbd5e1; border-radius:4px; font-size:12px; text-align:center;">
            <input type="text" id="manual-text" placeholder="Comment..." style="flex:1; padding:6px; border:1px solid #cbd5e1; border-radius:4px; font-size:12px;">
        </div>
        <button id="manual-add-btn" style="width:100%; background:var(--primary-color); color:white; border:none; padding:6px; border-radius:4px; font-size:11px; font-weight:600; cursor:pointer;">
            Add Note
        </button>
    `;
    sidebar.insertBefore(sidebarHeader, annotList);

    // Bind Manual Add
    document.getElementById('manual-add-btn').onclick = () => {
        const pg = document.getElementById('manual-page').value.trim();
        const txt = document.getElementById('manual-text').value.trim();
        if (!txt) return;
        saveAnnotation(pg || 'Gen', null, txt);
        document.getElementById('manual-text').value = '';
        document.getElementById('manual-page').value = '';
    };

    if (shouldTryRender) {
        // Try to Render with PDF.js (Direct PDFs only)
        pdfContainer.style.display = 'flex';
        annotList.innerHTML = '<div style="color:#94a3b8; text-align:center; padding:20px;">Loading...</div>';

        try {
            await renderPdf(url);
            loadSidebarAnnotations();
        } catch (e) {
            console.warn('PDF Render failed, falling back', e);
            pdfContainer.style.display = 'none';
            loadFallbackIframe(url, isDrive);
            loadSidebarAnnotations();
        }

    } else {
        // Standard Iframe (Drive, Docs, etc)
        loadFallbackIframe(url, isDrive);
        loadSidebarAnnotations();
    }
};

function loadFallbackIframe(url, isDrive) {
    const fileViewer = document.getElementById('fileViewer');
    let viewerUrl = url;
    if (isDrive || url.includes('drive.google.com')) {
        viewerUrl = url.replace('/view', '/preview');
    } else {
        viewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;
    }
    fileViewer.src = viewerUrl;
    fileViewer.style.display = 'block';
}

// Global Context setter
window.setPdfContext = (groupId, catKey, fileKey, groupData) => {
    currentPdfParams = { groupId, catKey, fileKey, group: groupData };
};

// --- PDF Render ---
async function renderPdf(url) {
    const loadingTask = pdfjsLib.getDocument(url);
    pdfDoc = await loadingTask.promise;

    const container = document.getElementById('pdfContainer');
    container.innerHTML = ''; // clear
    document.getElementById('pageCount').innerText = `${pdfDoc.numPages} Pages`;

    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: pdfScale });

        // Page Container
        const pageDiv = document.createElement('div');
        pageDiv.className = 'pdf-page';
        pageDiv.style.position = 'relative';
        pageDiv.style.marginBottom = '20px';
        pageDiv.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';

        // Canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport: viewport }).promise;
        pageDiv.appendChild(canvas);

        // Overlay Div (Annotation Layer)
        const overlay = document.createElement('div');
        overlay.className = 'annotation-layer';
        overlay.dataset.pageIndex = i; // 1-based
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.cursor = 'crosshair';

        // Interaction Events
        overlay.addEventListener('mousedown', handleMouseDown);
        overlay.addEventListener('mousemove', handleMouseMove);
        overlay.addEventListener('mouseup', handleMouseUp);

        // ... existing renderPdf loop ...
        pageDiv.appendChild(overlay);
        container.appendChild(pageDiv);

        // Render Existing Annotations for this page
        renderPageAnnotations(i, overlay);

        // INTERSECTION OBSERVER for Page Detection
        observer.observe(pageDiv);
    }
    // Initial Context
    updateCurrentPageContext(1);
};

// --- Page Detection Logic ---
const observer = new IntersectionObserver((entries) => {
    // Find the page with the highest intersection ratio
    let bestCandidate = null;
    entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            bestCandidate = entry.target;
        }
    });

    if (bestCandidate) {
        const overlay = bestCandidate.querySelector('.annotation-layer');
        if (overlay) {
            const pageIndex = parseInt(overlay.dataset.pageIndex);
            updateCurrentPageContext(pageIndex);
        }
    }
}, { threshold: [0.1, 0.5, 0.9] });

let currentPageVal = 1;
function updateCurrentPageContext(pageIndex) {
    if (!pageIndex) return;
    currentPageVal = pageIndex;

    // 1. Auto-fill Manual Input
    const pgInput = document.getElementById('manual-page');
    if (pgInput) pgInput.value = pageIndex;

    // 2. Filter Sidebar List
    loadSidebarAnnotations(pageIndex);
}

// --- Annotation UI Logic ---
function handleMouseDown(e) { /* ... existing ... */
    isDrawing = true;
    const rect = e.target.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;

    // Create temp div
    currentRectDiv = document.createElement('div');
    currentRectDiv.style.border = '2px solid var(--primary-color)';
    currentRectDiv.style.backgroundColor = 'rgba(37, 99, 235, 0.2)';
    currentRectDiv.style.position = 'absolute';
    currentRectDiv.style.left = startX + 'px';
    currentRectDiv.style.top = startY + 'px';
    e.target.appendChild(currentRectDiv);
}

function handleMouseMove(e) {
    if (!isDrawing || !currentRectDiv) return;
    const rect = e.target.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    const width = currentX - startX;
    const height = currentY - startY;

    currentRectDiv.style.width = Math.abs(width) + 'px';
    currentRectDiv.style.height = Math.abs(height) + 'px';
    currentRectDiv.style.left = (width < 0 ? currentX : startX) + 'px';
    currentRectDiv.style.top = (height < 0 ? currentY : startY) + 'px';
}

function handleMouseUp(e) {
    if (!isDrawing || !currentRectDiv) return;
    isDrawing = false;

    // Ignore small clicks
    if (parseInt(currentRectDiv.style.width) < 10) {
        currentRectDiv.remove();
        currentRectDiv = null;
        return;
    }

    const comment = prompt("Add a comment for this highlight:");
    if (comment) {
        const pageIndex = parseInt(e.target.dataset.pageIndex);
        const rectData = {
            left: currentRectDiv.style.left,
            top: currentRectDiv.style.top,
            width: currentRectDiv.style.width,
            height: currentRectDiv.style.height
        };
        saveAnnotation(pageIndex, rectData, comment);
    } else {
        currentRectDiv.remove();
    }
    currentRectDiv = null;
}

// --- Save & Render Logic ---
async function saveAnnotation(pageIndex, rect, text) {
    const { groupId, catKey, fileKey, group } = currentPdfParams;

    const userJson = localStorage.getItem('loginUser');
    const user = JSON.parse(userJson);
    const userName = user.name || 'Panel';

    let localMap = group.currentRemarksJson || {};
    let myRaw = localMap[fileKey]?.[userName] || '';

    let myComments = [];
    try {
        const parsed = JSON.parse(myRaw);
        if (Array.isArray(parsed)) myComments = parsed;
    } catch (e) {
        if (myRaw) myComments = [{ id: Date.now(), page: 'General', text: myRaw.replace(`${userName}:`, '') }];
    }

    const newComment = {
        id: Date.now(),
        page: pageIndex,
        text: text,
        rect: rect,
        date: new Date().toISOString()
    };

    myComments.push(newComment);

    // Optimistic Update
    if (rect && document.querySelector('.annotation-layer')) {
        renderPageAnnotations(pageIndex, document.querySelector(`.annotation-layer[data-page-index="${pageIndex}"]`));
    }
    // Reload sidebar with CURRENT page filter
    loadSidebarAnnotations(currentPageVal);

    // Save to DB
    await saveCommentsMap(group, catKey, fileKey, userName, myComments);
}

function renderPageAnnotations(pageIndex, overlay) {
    // Clear existing overlay boxes (except temporary drawing one)
    Array.from(overlay.children).forEach(c => {
        if (c !== currentRectDiv) c.remove();
    });

    const { fileKey, group } = currentPdfParams;
    if (!group) return; // Not ready

    // Gather ALL annotations from ALL panels for this file/page
    const allRemarks = group.currentRemarksJson?.[fileKey] || {};

    Object.entries(allRemarks).forEach(([panelName, remString]) => {
        try {
            const annotations = JSON.parse(remString);
            if (!Array.isArray(annotations)) return;

            annotations.forEach(ann => {
                if (parseInt(ann.page) !== pageIndex || !ann.rect) return;

                const box = document.createElement('div');
                box.style.position = 'absolute';
                box.style.left = ann.rect.left;
                box.style.top = ann.rect.top;
                box.style.width = ann.rect.width;
                box.style.height = ann.rect.height;
                box.style.backgroundColor = 'rgba(255, 255, 0, 0.2)'; // Yellow highlight
                box.style.border = '1px solid orange';
                box.title = `${panelName}: ${ann.text}`;
                box.className = 'annot-box';
                box.onclick = (e) => {
                    e.stopPropagation();
                    alert(`${panelName}: ${ann.text}`); // Simple feedback for now
                }
                overlay.appendChild(box);
            });
        } catch (e) { }
    });
}

function loadSidebarAnnotations() {
    const list = document.getElementById('annotationList');
    list.innerHTML = '';

    const { fileKey, group } = currentPdfParams;
    if (!group) return;

    const allRemarks = group.currentRemarksJson?.[fileKey] || {};

    Object.entries(allRemarks).forEach(([panelName, remString]) => {
        try {
            const annotations = JSON.parse(remString);
            if (!Array.isArray(annotations)) {
                // Legacy
                if (remString) createSidebarItem(panelName, { page: 'Gen', text: remString }, list);
                return;
            }

            annotations.forEach(ann => {
                createSidebarItem(panelName, ann, list);
            });
        } catch (e) { }
    });
}

function createSidebarItem(panelName, ann, list) {
    const el = document.createElement('div');
    el.style.background = '#f8fafc';
    el.style.border = '1px solid #e2e8f0';
    el.style.borderRadius = '8px';
    el.style.padding = '10px';
    el.style.marginBottom = '10px';

    el.innerHTML = `
        <div style="font-size:11px; font-weight:700; color:#64748b; margin-bottom:4px; display:flex; justify-content:space-between;">
            <span>${panelName}</span>
            <span style="background:#e2e8f0; padding:1px 5px; border-radius:4px;">Pg ${ann.page}</span>
        </div>
        <div style="font-size:12px; color:#334155;">${ann.text}</div>
    `;
    list.appendChild(el);
}

window.filterTable = (program) => {
    const btns = document.querySelectorAll('.filter-btn:not(.status-btn)');
    if (currentProgram === program) {
        currentProgram = 'ALL';
        btns.forEach(btn => btn.classList.remove('active'));
    } else {
        currentProgram = program;
        btns.forEach(btn => btn.classList.toggle('active', btn.innerText === program));
    }
    renderTable();
};

document.getElementById('searchInput')?.addEventListener('input', (e) => {
    searchTerm = e.target.value;
    renderTable();
});

function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../';
}

