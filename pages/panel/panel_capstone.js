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

        // 4. Fetch Defense Statuses and Detailed Feedback
        let defStatuses = [];
        let capstoneFeedback = [];

        try {
            const [dsRes, cfRes] = await Promise.all([
                supabaseClient.from('defense_statuses').select('*'),
                supabaseClient.from('capstone_feedback').select('*')
            ]);

            if (dsRes.error) console.error('Error fetching defense_statuses:', dsRes.error);
            if (cfRes.error) {
                console.error('DATABASE ERROR (capstone_feedback):', cfRes.error);
                if (cfRes.error.message.includes('relation "capstone_feedback" does not exist')) {
                    alert('⚠️ DATABASE SETUP MISSING: Please run the updated SQL script in Supabase SQL Editor. The table "capstone_feedback" is not found.');
                }
            }

            defStatuses = dsRes.data || [];
            capstoneFeedback = cfRes.data || [];
            console.log('LOAD SUCCESS:', { statuses: defStatuses.length, feedback: capstoneFeedback.length });
        } catch (e) {
            console.error('Critical Fetch Error:', e);
            alert('Critical database fetch error. Check console and SQL setup.');
        }

        // Helper to get merged status/remarks for a specific group/type
        const getMergedFeedback = (groupId, type) => {
            const norm = type.toLowerCase().replace(/[^a-z0-9]/g, '');
            const statuses = {};
            const remarks = {};

            // 1. From Legacy (Always try to read old data)
            const legacy = defStatuses.find(ds => ds.group_id == groupId && ds.defense_type.toLowerCase().replace(/[^a-z0-9]/g, '') === norm);
            if (legacy) {
                Object.entries(legacy.statuses || {}).forEach(([fKey, val]) => { statuses[fKey] = val; });
                Object.entries(legacy.remarks || {}).forEach(([fKey, val]) => { remarks[fKey] = val; });
            }

            // 2. Override/Merge from New Table (Primary source now)
            capstoneFeedback.filter(cf => cf.group_id == groupId && cf.defense_type.toLowerCase().replace(/[^a-z0-9]/g, '') === norm).forEach(cf => {
                if (!statuses[cf.file_key] || typeof statuses[cf.file_key] !== 'object') statuses[cf.file_key] = {};
                if (!remarks[cf.file_key] || typeof remarks[cf.file_key] !== 'object') remarks[cf.file_key] = {};

                if (cf.status) statuses[cf.file_key][cf.user_name] = cf.status;
                if (cf.remarks) remarks[cf.file_key][cf.user_name] = cf.remarks;
            });

            return { statuses, remarks, id: legacy ? legacy.id : null };
        };

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

                // 2. Check for files (Handle both JSON objects and direct URL strings)
                let filesObj = { titles: {}, pre_oral: {}, final: {} };

                const parseFileField = (val, defaultLabel) => {
                    if (!val) return {};
                    try {
                        // If it's a JSON object string: {"Label": "URL"}
                        if (val.trim().startsWith('{')) return JSON.parse(val);
                        // If it's a direct URL string
                        return { [defaultLabel]: val };
                    } catch (e) {
                        return { [defaultLabel]: val };
                    }
                };

                filesObj.titles = parseFileField(group.title_link, 'Title Proposal');
                filesObj.pre_oral = parseFileField(group.pre_oral_link, 'Pre-Oral Document');
                filesObj.final = parseFileField(group.final_link, 'Final Manuscript');

                let hasFiles = false;
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

                // Get Merged Feedback (Legacy + New Table)
                const feedbackRes = getMergedFeedback(group.id, normType);
                const currentStatuses = feedbackRes.statuses;
                const currentRemarks = feedbackRes.remarks;

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
                    type: sched ? sched.schedule_type : defType,
                    normalizedType: normType,
                    groupName: group.group_name,
                    program: (group.program || '').toUpperCase(),
                    date: sched ? sched.schedule_date : null,
                    time: sched ? sched.schedule_time : null,
                    venue: sched ? sched.schedule_venue : 'Online / TBA',
                    panels: panelList,
                    files: filesObj,

                    // Unified accessors
                    titleStatus, preOralStatus, finalStatus,
                    titleRemarks, preOralRemarks, finalRemarks,

                    // Store raw status info for updates
                    defenseStatusId: feedbackRes.id,
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
            // Enhanced Clickable Style
            actionBtn = `
                <button onclick="${hasFiles ? `openFileModal('${g.id}')` : ''}" 
                    style="background: ${hasFiles ? 'var(--primary-color)' : '#f1f5f9'}; color: ${hasFiles ? 'white' : '#94a3b8'}; border: none; cursor: ${hasFiles ? 'pointer' : 'default'}; display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 8px; font-weight: 700; font-size: 0.8rem; box-shadow: ${hasFiles ? '0 4px 10px rgba(37, 99, 235, 0.2)' : 'none'}; transition: all 0.2s; transition: all 0.2s;"
                    onmouseover="${hasFiles ? 'this.style.transform=\'translateY(-2px)\'; this.style.boxShadow=\'0 6px 15px rgba(37, 99, 235, 0.3)\'' : ''}"
                    onmouseout="${hasFiles ? 'this.style.transform=\'translateY(0)\'; this.style.boxShadow=\'0 4px 10px rgba(37, 99, 235, 0.2)\'' : ''}">
                    <span class="material-icons-round" style="font-size: 18px;">${hasFiles ? 'folder_open' : 'folder_off'}</span>
                    <span>${hasFiles ? 'View Files' : 'No Files'}</span>
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
    console.log('Opening Modal for Group ID:', groupId);
    const stringGroupId = String(groupId);
    const normTab = normalizeType(currentTab);

    // Attempt 1: Exact Match (ID + Current Tab)
    let group = allData.find(g => String(g.id) === stringGroupId && normalizeType(g.type) === normTab);

    // Attempt 2: ID Match Fallback (If tab mismatch occurred)
    if (!group) {
        group = allData.find(g => String(g.id) === stringGroupId);
    }

    if (!group) {
        console.error('Group not found in allData:', { stringGroupId, normTab });
        alert('Data Error: Could not find group information. Try refreshing the page.');
        return;
    }

    document.getElementById('modalGroupName').innerText = group.groupName;
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '';

    // Reset Viewer State
    const pdfContainer = document.getElementById('pdfViewerContainer');
    const placeholder = document.getElementById('viewerPlaceholder');
    const toolbar = document.getElementById('viewerToolbar');

    if (pdfContainer) pdfContainer.style.display = 'none';
    if (placeholder) placeholder.style.display = 'flex';
    if (toolbar) toolbar.style.display = 'none';

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

    const userJson = localStorage.getItem('loginUser');
    const user = userJson ? JSON.parse(userJson) : null;
    const userName = user ? (user.name || user.full_name || 'Panel') : 'Panel';

    const select = document.querySelector(`select[onchange*="'${categoryKey}'"][onchange*="'${fileKey}'"]`);
    if (select) { select.disabled = true; select.style.opacity = '0.5'; }

    try {
        const normTab = normalizeType(currentTab);
        const group = allData.find(g => g.id === groupId && normalizeType(g.type) === normTab);
        if (!group) throw new Error('Could not find group data in current view.');

        // 1. Save to individual feedback table
        const { error: fError } = await supabaseClient
            .from('capstone_feedback')
            .upsert({
                group_id: groupId,
                defense_type: group.type,
                file_key: fileKey,
                user_name: userName,
                status: newStatus,
                updated_at: new Date()
            }, { onConflict: 'group_id, defense_type, file_key, user_name' });

        if (fError) {
            console.error('Individual feedback save failed:', fError);
            throw new Error(`Database Error: ${fError.message}. Did you run the SQL script?`);
        }

        // 2. Update Legacy/Group Status mapping (for table view)
        let localMap = group.currentStatusJson || {};
        if (typeof localMap[fileKey] !== 'object') localMap[fileKey] = {};
        localMap[fileKey][userName] = newStatus;

        const { error: dsError } = await supabaseClient
            .from('defense_statuses')
            .upsert({
                group_id: groupId,
                defense_type: group.type,
                statuses: localMap,
                updated_at: new Date()
            }, { onConflict: 'group_id, defense_type' });

        if (dsError) console.warn('Legacy status update failed (non-critical):', dsError);

        // Update local object and refresh UI
        group.currentStatusJson = localMap;

        // Ensure stage-specific statuses are also updated for immediate modal feedback
        if (normTab.includes('title')) group.titleStatus = localMap;
        else if (normTab.includes('preoral')) group.preOralStatus = localMap;
        else if (normTab.includes('final')) group.finalStatus = localMap;

        if (select) {
            select.disabled = false;
            select.style.opacity = '1';
            select.style.borderColor = '#22c55e';
        }

        // Refresh the badges and main table
        renderTable();
        console.log('Status saved successfully for:', userName);
    } catch (err) {
        console.error('Update Status Critical Error:', err);
        alert('❌ FAILED TO SAVE STATUS: ' + err.message + '\n\nMake sure the capstone_feedback table exists in Supabase!');
        if (select) {
            select.disabled = false;
            select.style.opacity = '1';
            select.style.borderColor = '#ef4444';
        }
    }
};

window.saveRemarks = async (groupId, categoryKey, fileKey) => {
    const userJson = localStorage.getItem('loginUser');
    if (!userJson) return;
    const user = JSON.parse(userJson);
    const userName = user.name || user.full_name || 'Panel';

    const textarea = document.getElementById(`remarks-${categoryKey}-${fileKey}`);
    const btn = textarea ? textarea.nextElementSibling : null;
    const newText = textarea ? textarea.value.trim() : '';

    if (!newText) { alert('Please enter remarks.'); return; }
    if (btn) { btn.disabled = true; btn.innerText = 'Saving...'; }

    try {
        const normTab = normalizeType(currentTab);
        const group = allData.find(g => g.id == groupId && normalizeType(g.type) === normTab);
        if (!group) throw new Error('Data context error.');

        const statusSelect = document.querySelector(`select[onchange*="'${categoryKey}'"][onchange*="'${fileKey}'"]`);
        const currentSelectedStatus = statusSelect ? statusSelect.value : 'Pending';

        // 1. Save to Database
        const { error: fError } = await supabaseClient
            .from('capstone_feedback')
            .upsert({
                group_id: groupId,
                defense_type: group.type,
                file_key: fileKey,
                user_name: userName,
                remarks: newText,
                status: currentSelectedStatus,
                updated_at: new Date()
            }, { onConflict: 'group_id, defense_type, file_key, user_name' });

        if (fError) throw fError;

        // 2. Sync Legacy/Group Status mapping
        let localStatusMap = group.currentStatusJson || {};
        if (typeof localStatusMap[fileKey] !== 'object') localStatusMap[fileKey] = {};
        localStatusMap[fileKey][userName] = currentSelectedStatus;

        let localRemarksMap = group.currentRemarksJson || {};
        if (typeof localRemarksMap[fileKey] !== 'object') localRemarksMap[fileKey] = {};
        localRemarksMap[fileKey][userName] = `${userName}: ${newText}`;

        await supabaseClient
            .from('defense_statuses')
            .upsert({
                group_id: groupId,
                defense_type: group.type,
                statuses: localStatusMap,
                remarks: localRemarksMap,
                updated_at: new Date()
            }, { onConflict: 'group_id, defense_type' });

        // Success Feedback
        group.currentRemarksJson = localRemarksMap;
        group.currentStatusJson = localStatusMap;

        if (btn) {
            btn.innerText = 'Updated';
            btn.style.background = '#dcfce7';
            btn.style.color = '#166534';
            setTimeout(() => {
                btn.disabled = false;
                btn.innerText = 'Update Remarks';
                btn.style.background = '';
                btn.style.color = '';
            }, 2000);
        }
        // Refresh the table UI
        renderTable();

    } catch (e) {
        console.error('SAVE ERROR:', e);
        alert('Could not save remarks. Please check your connection.');
        if (btn) {
            btn.disabled = false;
            btn.innerText = 'Update Remarks';
            btn.style.background = '#ef4444';
            btn.style.color = 'white';
        }
    }
};

// --- PDF.js Integration Variables ---
let currentPdf = null;
let currentPageNum = 1;
let pdfScale = 1.5;
let currentHighlightedText = "";
let currentHighlightedPage = 0;
const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

window.closeFileModal = () => {
    document.getElementById('fileModal').style.display = 'none';
    const container = document.getElementById('pdfViewerContainer');
    if (container) container.style.display = 'none';
    const sidebar = document.getElementById('commentsSidebar');
    if (sidebar) sidebar.style.display = 'none';

    currentPdf = null;
    currentViewerFileKey = null;
    currentViewerGroupId = null;
    currentHighlightedText = "";
};

// --- PDF.js CORE VIEWER ---
window.loadViewer = async (url, groupId = null, fileKey = null) => {
    if (!url) return;
    currentViewerGroupId = groupId;
    currentViewerFileKey = fileKey;
    currentHighlightedText = ""; // Reset highlight

    const placeholder = document.getElementById('viewerPlaceholder');
    const container = document.getElementById('pdfViewerContainer');
    const toolbar = document.getElementById('viewerToolbar');
    const sidebar = document.getElementById('commentsSidebar');
    const nameDisplay = document.getElementById('currentFileNameDisplay');
    const linkBtn = document.getElementById('externalLinkBtn');

    if (placeholder) placeholder.style.display = 'none';
    if (container) container.style.display = 'block';
    if (toolbar) toolbar.style.display = 'flex';
    if (sidebar) sidebar.style.display = 'flex';
    if (nameDisplay) nameDisplay.innerText = (fileKey || 'File').replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    if (linkBtn) linkBtn.href = url;

    // Load PDF
    try {
        const loadingTask = pdfjsLib.getDocument(url);
        currentPdf = await loadingTask.promise;
        currentPageNum = 1;
        renderPage(currentPageNum);
        loadComments(groupId, fileKey);

        // --- ENFORCE HIGHLIGHT FIRST: Reset UI ---
        const input = document.getElementById('commentInput');
        const postBtn = input ? input.nextElementSibling : null;
        if (input) {
            input.disabled = true;
            input.placeholder = "⚠️ Highlight text in the PDF first to comment...";
            input.value = "";
        }
    } catch (e) {
        console.error('PDF Load Error:', e);
        container.innerHTML = `<div style="padding:40px; text-align:center; color:#ef4444;">Failed to load PDF. It might be restricted or not a PDF file.</div>`;
    }
};

async function renderPage(num) {
    if (!currentPdf) return;
    const target = document.getElementById('pdfRenderTarget');
    const container = document.getElementById('pdfViewerContainer');
    target.innerHTML = '<div style="padding:40px; text-align:center; color:white;">Rendering page...</div>';

    const page = await currentPdf.getPage(num);

    // Auto-calculate scale to fit width
    const containerWidth = container.clientWidth - 80; // Margin
    const unscaledViewport = page.getViewport({ scale: 1 });
    const dynamicScale = containerWidth / unscaledViewport.width;
    pdfScale = dynamicScale;

    const viewport = page.getViewport({ scale: pdfScale });

    target.innerHTML = '';
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    target.style.width = viewport.width + 'px';
    target.style.height = viewport.height + 'px';
    target.appendChild(canvas);

    const renderContext = { canvasContext: context, viewport: viewport };
    await page.render(renderContext).promise;

    // Render Text Layer for Selection
    const textContent = await page.getTextContent();
    const textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'textLayer';
    textLayerDiv.style.width = viewport.width + 'px';
    textLayerDiv.style.height = viewport.height + 'px';
    target.appendChild(textLayerDiv);

    pdfjsLib.renderTextLayer({
        textContent: textContent,
        container: textLayerDiv,
        viewport: viewport,
        textDivs: []
    });

    document.getElementById('pageCountDisplay').innerText = `PAGE ${num} / ${currentPdf.numPages}`;
}

window.changePage = (offset) => {
    const newPage = currentPageNum + offset;
    if (newPage >= 1 && newPage <= currentPdf.numPages) {
        currentPageNum = newPage;
        renderPage(currentPageNum);
        document.getElementById('pdfViewerContainer').scrollTop = 0;
    }
};

// --- HIGHLIGHT DETECTION (Real-time Sync Version) ---
document.addEventListener('mouseup', () => {
    // Small timeout to ensure selection is finalized
    setTimeout(() => {
        const selection = window.getSelection();
        const text = selection.toString().trim();
        const target = document.getElementById('pdfRenderTarget');

        if (!text || !target || !target.contains(selection.anchorNode)) return;

        currentHighlightedText = text;
        currentHighlightedPage = currentPageNum;

        const input = document.getElementById('commentInput');
        const postBtn = input ? input.parentElement.querySelector('button') : null;

        if (input) {
            // UNLOCK UI
            input.disabled = false;
            input.placeholder = "Type your feedback after the '—' symbol...";
            if (postBtn) postBtn.disabled = false;

            const newReference = `RE Page ${currentPageNum}: "${text}"`;
            const currentVal = input.value;

            // REAL-TIME UPDATE LOGIC:
            // If the user already typed something, we want to replace the reference part but keep their typed feedback.
            if (currentVal.includes('—')) {
                const parts = currentVal.split('—');
                const existingFeedback = parts.length > 1 ? parts.slice(1).join('—') : "";
                input.value = `${newReference}\n— ${existingFeedback.trim()}`;
            } else {
                // Fresh start or format lost
                input.value = `${newReference}\n— `;
            }

            // Move cursor to the very end so they can continue typing feedback
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
        }
    }, 50);
});

// --- SIDEBAR COMMENT SYSTEM ---
async function loadComments(groupId, fileKey) {
    const list = document.getElementById('commentsList');
    if (!list) return;

    list.innerHTML = `<div style="text-align:center; padding: 20px; color:#94a3b8;"><div class="viewer-loader" style="width:20px; height:20px; border:2px solid #e2e8f0; border-top-color:var(--primary-color); border-radius:50%; animation:spin 1s linear infinite; display:inline-block; margin-bottom:10px;"></div><br>Loading discussion...</div>`;

    try {
        const { data: comments, error } = await supabaseClient
            .from('file_comments')
            .select('*')
            .eq('group_id', groupId)
            .eq('file_key', fileKey)
            .order('created_at', { ascending: true });

        if (error) throw error;
        renderComments(comments || []);
    } catch (e) {
        console.error('Comments Load Error:', e);
        list.innerHTML = `<div style="text-align:center; color:#ef4444; padding:20px; font-size:0.8rem;">Error loading comments.</div>`;
    }
}

function renderComments(comments) {
    const list = document.getElementById('commentsList');
    if (comments.length === 0) {
        list.innerHTML = `<div style="text-align: center; color: #94a3b8; margin-top: 50px;">
            <span class="material-icons-round" style="font-size: 40px; opacity: 0.3;">forum</span>
            <p style="font-size: 0.85rem; margin-top: 10px;">No feedback yet.<br>Start the discussion below.</p>
        </div>`;
        return;
    }

    const user = JSON.parse(localStorage.getItem('loginUser') || '{}');
    const myName = user.name || user.full_name || 'Panelist';

    list.innerHTML = comments.map(c => {
        const isMe = c.user_name === myName;
        const time = new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Highlight correction references
        let formattedText = c.comment_text;
        if (formattedText.startsWith('RE ')) {
            const parts = formattedText.split('\n— ');
            if (parts.length > 1) {
                formattedText = `<div style="background: rgba(0,0,0,0.05); padding: 8px 12px; border-radius: 8px; border-left: 3px solid ${isMe ? '#fff' : 'var(--primary-color)'}; font-size: 0.8rem; margin-bottom: 8px; font-style: italic; opacity: 0.9;">${parts[0]}</div>` + parts.slice(1).join('\n— ');
            }
        }

        return `
            <div style="display: flex; flex-direction: column; align-items: ${isMe ? 'flex-end' : 'flex-start'}; margin-bottom: 15px;">
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
                    <span style="font-size: 0.75rem; font-weight: 700; color: #475569;">${isMe ? 'You' : c.user_name}</span>
                    <span style="font-size: 0.65rem; color: #94a3b8;">${time}</span>
                </div>
                <div style="background: ${isMe ? 'var(--primary-color)' : '#f1f5f9'}; 
                            color: ${isMe ? 'white' : '#1e293b'}; 
                            padding: 12px 16px; 
                            border-radius: ${isMe ? '18px 18px 2px 18px' : '2px 18px 18px 18px'}; 
                            font-size: 0.9rem; 
                            line-height: 1.5; 
                            box-shadow: 0 2px 4px rgba(0,0,0,0.02);
                            max-width: 95%;">
                    ${formattedText}
                </div>
            </div>
        `;
    }).join('');

    setTimeout(() => { list.scrollTop = list.scrollHeight; }, 100);
}

window.postComment = async () => {
    const input = document.getElementById('commentInput');
    const text = input.value.trim();

    // FORCE HIGHLIGHT LOGIC: Strict validation
    if (!text.includes('RE Page') || !text.includes('—')) {
        alert('❌ FORCE REFERENCE: You must highlight text in the PDF first! Do not delete the auto-generated reference.');
        return;
    }

    if (!text || !currentViewerGroupId || !currentViewerFileKey) return;

    const user = JSON.parse(localStorage.getItem('loginUser') || '{}');
    const userName = user.name || user.full_name || 'Panelist';

    input.disabled = true;

    try {
        const { error } = await supabaseClient.from('file_comments').insert({
            group_id: currentViewerGroupId,
            file_key: currentViewerFileKey,
            user_name: userName,
            user_role: 'Panelist',
            comment_text: text
        });

        if (error) throw error;
        input.value = '';
        input.disabled = true; // Re-lock until next highlight
        input.placeholder = "⚠️ Highlight next section to comment...";
        currentHighlightedText = "";
        loadComments(currentViewerGroupId, currentViewerFileKey);
    } catch (e) {
        alert('Could not post comment: ' + e.message);
    } finally {
        if (!input.value) {
            // Success case handled above, but if error we might want to keep it enabled?
            // Actually, let's just use the logic in 'try'
        }
    }
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

