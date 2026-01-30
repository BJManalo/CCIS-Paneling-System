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
let adobeDCView = null;
let currentViewerFileKey = null;
let currentViewerGroupId = null;
const ADOBE_CLIENT_ID = '5edc19dfde9349e3acb7ecc73bfa4848';

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
                loadViewer(url, groupId, label);
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
                    <div style="margin-top: 10px; border-top: 1px dashed #e2e8f0; padding-top: 10px;">
                        <div style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 5px;">Panel Evaluations</div>
                        ${panelsToDisplay.map(panel => `
                            <div style="font-size: 11px; margin-bottom: 4px; color: #475569;">
                                <strong style="color: var(--primary-color);">${panel}:</strong> ${fileStatuses[panel] || 'Pending'}
                                ${fileRemarks[panel] ? `<br><span style="color: #64748b; font-style: italic;">"${fileRemarks[panel].replace(panel + ':', '').trim()}"</span>` : ''}
                            </div>
                        `).join('')}
                    </div>
                `;
            }

            let interactiveControls = '';
            if (currentRole === 'Panel') {
                interactiveControls = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px;">Your Status</span>
                    <div style="font-size: 12px; font-weight: 700; color: ${statusColor}; background: ${statusBg}; padding: 4px 8px; border-radius: 99px; display: flex; align-items: center; gap: 4px;">
                        <span class="material-icons-round" style="font-size: 14px;">${iconText}</span>
                        ${myStatus}
                    </div>
                </div>
                <select onchange="updateStatus(${group.id}, '${categoryKey}', '${label}', this.value)" 
                    style="width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 13px; cursor: pointer; background: white; color: #334155; font-weight: 500; outline: none; margin-bottom: 5px;">
                    <option value="Pending" ${myStatus === 'Pending' ? 'selected' : ''}>Change Your Status...</option>
                    ${optionsHtml}
                </select>
                <div style="margin-top: 5px;">
                    <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px; margin-bottom: 5px;">Your Remarks</div>
                    <textarea id="remarks-${categoryKey}-${label}" placeholder="Add your feedback..." 
                        style="width: 100%; padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px; font-family: 'Outfit', sans-serif; font-size: 13px; min-height: 60px; resize: vertical;">${myRemarks.includes(':') ? myRemarks.split(':').slice(1).join(':').trim() : myRemarks}</textarea>
                    <button onclick="saveRemarks(${group.id}, '${categoryKey}', '${label}')" 
                        style="width: 100%; margin-top: 5px; background: ${myRemarks ? '#dcfce7' : 'var(--primary-light)'}; color: ${myRemarks ? '#166534' : 'var(--primary-color)'}; border: none; padding: 6px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">
                        ${myRemarks ? 'Update Remarks' : 'Save Remarks'}
                    </button>
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

    // UI Loading state
    const select = document.querySelector(`select[onchange*="'${categoryKey}'"][onchange*="'${fileKey}'"]`);
    if (select) {
        select.disabled = true;
        select.style.opacity = '0.5';
    }

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

        // Multi-panel structure: { "title1": { "Panel A": "Approved" } }
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

        // Fast UI Update
        const select = document.querySelector(`select[onchange*="'${categoryKey}'"][onchange*="'${fileKey}'"]`);
        if (select) {
            select.disabled = false;
            select.style.opacity = '1';
            select.style.borderColor = '#22c55e'; // Green success border
        }

        // Refresh the main table background data
        renderTable();
    } catch (err) {
        console.error(err);
        alert('Failed to update status: ' + (err.message || err));
        const select = document.querySelector(`select[onchange*="'${categoryKey}'"][onchange*="'${fileKey}'"]`);
        if (select) {
            select.disabled = false;
            select.style.opacity = '1';
        }
    }
};

window.saveRemarks = async (groupId, categoryKey, fileKey) => {
    const userJson = localStorage.getItem('loginUser');
    if (!userJson) return;
    const user = JSON.parse(userJson);
    const userName = user.name || 'Panel';
    const textarea = document.getElementById(`remarks-${categoryKey}-${fileKey}`);
    const btn = textarea ? textarea.nextElementSibling : null;
    const newText = textarea ? textarea.value.trim() : '';
    if (!newText) return;

    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Saving...';
    }

    let formattedText = newText;
    const prefix = `${userName}:`;
    if (!formattedText.startsWith(prefix)) { formattedText = `${prefix} ${newText}`; }

    // FIX: Look up using currentTab context same as other functions
    const normTab = normalizeType(currentTab);
    const group = allData.find(g => g.id === groupId && normalizeType(g.type) === normTab);

    let localMap = group.currentRemarksJson || {};
    if (typeof localMap[fileKey] !== 'object') {
        localMap[fileKey] = {};
    }
    localMap[fileKey][userName] = formattedText;

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
                group_id: groupId,
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

        // Persistent visual feedback
        if (textarea && btn) {
            btn.innerText = 'Saved';
            btn.style.background = '#dcfce7';
            btn.style.color = '#166534';
            btn.disabled = false;
        }
    } catch (e) {
        console.error(e);
        alert('Error saving remarks: ' + (e.message || e));
        const btn = document.querySelector(`button[onclick*="'${categoryKey}'"][onclick*="'${fileKey}'"]`);
        if (btn) {
            btn.disabled = false;
            btn.innerText = 'Save Remarks';
        }
    }
};

window.closeFileModal = () => {
    document.getElementById('fileModal').style.display = 'none';
    document.getElementById('fileViewer').src = '';
    const adobeContainer = document.getElementById('adobe-dc-view');
    if (adobeContainer) {
        adobeContainer.innerHTML = '';
        adobeContainer.style.display = 'none';
        delete adobeContainer.dataset.activeUrl;
    }
    adobeDCView = null;
    currentViewerFileKey = null;
    currentViewerGroupId = null;
};

window.loadViewer = async (url, groupId = null, fileKey = null) => {
    if (!url) return;
    currentViewerGroupId = groupId;
    currentViewerFileKey = fileKey;

    let absoluteUrl = url.trim();
    if (!absoluteUrl.startsWith('http') && !absoluteUrl.startsWith('//')) absoluteUrl = 'https://' + absoluteUrl;

    const lowerUrl = absoluteUrl.toLowerCase();
    const isPDF = (lowerUrl.includes('.pdf') || lowerUrl.includes('supabase.co') || lowerUrl.includes('drive.google.com')) && !lowerUrl.includes('docs.google.com/viewer');

    const iframe = document.getElementById('fileViewer');
    const adobeContainer = document.getElementById('adobe-dc-view');
    const placeholder = document.getElementById('viewerPlaceholder');
    const toolbar = document.getElementById('viewerToolbar');
    const linkBtn = document.getElementById('externalLinkBtn');

    if (adobeContainer.dataset.activeUrl === absoluteUrl && adobeContainer.innerHTML !== '') {
        adobeContainer.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
        if (iframe) iframe.style.display = 'none';
        if (toolbar) toolbar.style.display = 'flex';
        return;
    }
    adobeContainer.dataset.activeUrl = absoluteUrl;

    const showCompatibilityMode = (reason) => {
        console.warn('Switching to compatibility mode:', reason);
        adobeContainer.style.display = 'none';
        if (iframe) iframe.style.display = 'none';
        placeholder.style.display = 'flex';
        placeholder.innerHTML = `
            <div style="text-align: center; color: #64748b; padding: 20px;">
                <div class="viewer-loader" style="width: 30px; height: 30px; border: 3px solid #e2e8f0; border-top: 3px solid var(--primary-color); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 15px; display: inline-block;"></div>
                <p style="font-weight: 600;">Loading Compatibility Preview...</p>
                <p style="font-size: 0.8rem; margin-top: 6px; max-width: 300px; color: #ef4444; font-weight: 700;">Error: ${reason || 'Direct Link Restricted'}</p>
                <p style="font-size: 0.75rem; margin-top: 4px; color: #94a3b8;">Switching to the document's original viewer...</p>
            </div>
        `;

        let finalFallbackUrl = absoluteUrl;
        if (lowerUrl.includes('drive.google.com') && absoluteUrl.match(/\/d\/([^\/]+)/)) {
            finalFallbackUrl = `https://drive.google.com/file/d/${absoluteUrl.match(/\/d\/([^\/]+)/)[1]}/preview`;
        } else {
            finalFallbackUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(absoluteUrl)}&embedded=true`;
        }

        placeholder.innerHTML += `
            <div style="display: flex; gap: 10px; justify-content: center; margin-top: 15px;">
                <button onclick="window.loadViewer('${absoluteUrl}', '${groupId}', '${fileKey}')" style="background: #fff; border: 1.5px solid #e2e8f0; color: #475569; padding: 6px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s;">
                    <span class="material-icons-round" style="font-size: 16px;">refresh</span>
                    Retry
                </button>
                <a href="${absoluteUrl}" target="_blank" style="background: var(--primary-color); color: #fff; padding: 6px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; text-decoration: none; display: flex; align-items: center; gap: 6px; transition: all 0.2s;">
                    <span class="material-icons-round" style="font-size: 16px;">open_in_new</span>
                    Open Original Link
                </a>
            </div>
        `;

        setTimeout(() => {
            if (iframe) {
                iframe.src = finalFallbackUrl;
                iframe.onload = () => {
                    placeholder.style.display = 'none';
                    iframe.style.display = 'block';
                    if (toolbar) toolbar.style.display = 'flex';
                };
            }
            if (linkBtn) linkBtn.href = absoluteUrl;
        }, 500);
    };

    if (isPDF) {
        const user = JSON.parse(localStorage.getItem('loginUser') || '{}');
        const userName = user.name || user.full_name || 'Panelist';

        adobeContainer.innerHTML = ''; // Start fresh
        adobeContainer.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
        if (iframe) iframe.style.display = 'none';

        const initAdobe = async () => {
            try {
                // Always recreate view instance if container was cleared
                adobeDCView = new AdobeDC.View({
                    clientId: ADOBE_CLIENT_ID,
                    divId: "adobe-dc-view"
                });

                const fileId = absoluteUrl.match(/\/d\/([^\/]+)/)?.[1] || absoluteUrl.match(/id=([^\&]+)/)?.[1];
                const fileName = (fileKey || 'document').replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()) + '.pdf';

                let finalUrl = absoluteUrl;
                if (lowerUrl.includes('drive.google.com') && fileId) {
                    // This is the most 'raw' link variant that often bypasses the browser's intermediate pages
                    finalUrl = `https://drive.google.com/uc?id=${fileId}&export=media&confirm=t`;
                }

                console.log('ADOBE LOADING:', { finalUrl, fileName, clientId: ADOBE_CLIENT_ID, userName });

                // Identify the user to Adobe so comments don't show as 'Guest'
                adobeDCView.registerCallback(AdobeDC.View.Enum.CallbackType.GET_USER_PROFILE_API, () => {
                    return Promise.resolve({
                        userProfile: {
                            name: userName,
                            displayName: userName,
                            firstName: userName.split(' ')[0],
                            lastName: userName.split(' ').slice(1).join(' ') || '',
                            email: user.email || ''
                        }
                    });
                });

                const adobeFilePromise = adobeDCView.previewFile({
                    content: { location: { url: finalUrl } },
                    metaData: { fileName: fileName, id: fileKey || 'unique-id' }
                }, {
                    embedMode: "FULL_WINDOW", // Matches the rich UI in the 1st image
                    showAnnotationTools: true,
                    enableAnnotationAPIs: true,
                    showLeftHandPanel: true,
                    showPageControls: true,
                    showBookmarks: true,
                    defaultViewMode: "FIT_PAGE"
                });

                adobeFilePromise.then(adobeViewer => {
                    if (placeholder) placeholder.style.display = 'none';
                    adobeViewer.getAnnotationManager().then(async annotationManager => {
                        // Optional: Identify user again directly to the annotation manager
                        try {
                            if (annotationManager.setUserProfile) {
                                annotationManager.setUserProfile({
                                    name: userName,
                                    firstName: userName.split(' ')[0]
                                });
                            }
                        } catch (e) { }

                        try {
                            const { data } = await supabaseClient.from('pdf_annotations').select('annotation_data')
                                .eq('group_id', groupId).eq('file_key', fileKey).single();
                            if (data?.annotation_data) annotationManager.addAnnotations(data.annotation_data);
                        } catch (e) { }

                        // Force settings to ensure name is picked up correctly
                        annotationManager.setConfig({
                            showAuthorName: true,
                            authorName: userName
                        });
                        annotationManager.registerCallback(AdobeDC.View.Enum.CallbackType.SAVE_API, async (annotations) => {
                            try {
                                await supabaseClient.from('pdf_annotations').upsert({
                                    group_id: groupId, file_key: fileKey, annotation_data: annotations,
                                    user_name: userName, updated_at: new Date()
                                }, { onConflict: 'group_id, file_key' });
                                return { code: AdobeDC.View.Enum.ApiResponseCode.SUCCESS };
                            } catch (err) { return { code: AdobeDC.View.Enum.ApiResponseCode.FAIL }; }
                        }, { autoSaveFrequency: 2 });
                    });
                }).catch(err => {
                    console.error('CRITICAL ADOBE ERROR:', err);
                    let specificError = 'Check Console';
                    if (err) {
                        specificError = err.type || err.code || err.message || (typeof err === 'string' ? err : JSON.stringify(err).substring(0, 50));
                    }
                    delete adobeContainer.dataset.activeUrl;
                    showCompatibilityMode('Adobe SDK Error: ' + specificError);
                });
            } catch (e) {
                console.error('Adobe init error:', e);
                showCompatibilityMode('Init Failed: ' + e.message);
            }
        };

        if (window.AdobeDC) initAdobe();
        else document.addEventListener("adobe_dc_view_sdk.ready", initAdobe);

        if (toolbar) toolbar.style.display = 'flex';
        if (linkBtn) linkBtn.href = absoluteUrl;
        return;
    }

    showCompatibilityMode('Non-PDF detected');
};

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

