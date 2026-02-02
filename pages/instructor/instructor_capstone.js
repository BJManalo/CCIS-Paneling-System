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

let currentRole = 'Adviser'; // Default to Adviser for Instructor Account
let adobeDCView = null;
let currentViewerFileKey = null;
let currentViewerGroupId = null;
let currentBlobUrl = null;
let autoSaveInterval = null;
let isSaving = false;
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

    // Auth Check for Instructor
    if (user.role !== 'Instructor' && user.role !== 'Instructor/Adviser') {
        window.location.href = '../../';
        return;
    }

    const userName = user ? (user.name || user.full_name || 'Instructor') : 'Instructor';

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

        // 3. Fetch Evaluations (For sequential Locking)
        const { data: students, error: stdError } = await supabaseClient
            .from('students')
            .select('id, group_id');

        if (stdError) throw stdError;

        // We check if THIS user has evaluated the group for a specific stage.
        const [indRes, sysRes] = await Promise.all([
            supabaseClient.from('individual_evaluations').select('student_id, schedule_id').eq('panelist_name', userName),
            supabaseClient.from('system_evaluations').select('group_id, schedule_id').eq('panelist_name', userName)
        ]);

        const indEvs = indRes.data || [];
        const sysEvs = sysRes.data || [];

        // Build Group Grades Map based on evaluations
        groupGrades = {};

        // Add individual evaluations
        indEvs.forEach(ev => {
            const student = students.find(s => s.id === ev.student_id);
            const sched = schedules.find(s => s.id === ev.schedule_id);
            if (student && sched) {
                if (!groupGrades[student.group_id]) groupGrades[student.group_id] = new Set();
                groupGrades[student.group_id].add(normalizeType(sched.schedule_type));
            }
        });

        // Add system evaluations
        sysEvs.forEach(ev => {
            const sched = schedules.find(s => s.id === ev.schedule_id);
            if (sched) {
                if (!groupGrades[ev.group_id]) groupGrades[ev.group_id] = new Set();
                groupGrades[ev.group_id].add(normalizeType(sched.schedule_type));
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
            defStatuses = dsRes.data || [];
            capstoneFeedback = cfRes.data || [];
        } catch (e) {
            console.error('Critical Fetch Error:', e);
        }

        // Helper to get merged status/remarks for a specific group/type
        const getMergedFeedback = (groupId, type) => {
            const norm = type.toLowerCase().replace(/[^a-z0-9]/g, '');
            const statuses = {};
            const remarks = {};
            const annotations = {};

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
                if (!annotations[cf.file_key] || typeof annotations[cf.file_key] !== 'object') annotations[cf.file_key] = {};

                if (cf.status) statuses[cf.file_key][cf.user_name] = cf.status;
                if (cf.remarks) remarks[cf.file_key][cf.user_name] = cf.remarks;
                if (cf.annotated_file_url) annotations[cf.file_key][cf.user_name] = cf.annotated_file_url;
            });

            return { statuses, remarks, annotations, id: legacy ? legacy.id : null };
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
                const sched = schedules.find(s => s.group_id === group.id && normalizeType(s.schedule_type) === normType);

                // 2. Check for files (Handle both JSON objects and direct URL strings)
                let filesObj = { titles: {}, pre_oral: {}, final: {} };

                const parseFileField = (val, defaultLabel) => {
                    if (!val) return {};
                    try {
                        if (val.trim().startsWith('{')) return JSON.parse(val);
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
                // Adviser Check: Check if current user is the adviser
                const isAdviser = (group.adviser && group.adviser.includes(userName)) || (user.role === 'Instructor/Adviser' && group.adviser === userName);
                // Flexible check for partial name match or exact match depending on data quality

                let panelList = [];
                if (sched) {
                    panelList = [sched.panel1, sched.panel2, sched.panel3, sched.panel4, sched.panel5].filter(p => p);
                } else {
                    const allGroupSchedules = schedules.filter(s => s.group_id === group.id);
                    const allPanels = new Set();
                    allGroupSchedules.forEach(s => {
                        [s.panel1, s.panel2, s.panel3, s.panel4, s.panel5].forEach(p => {
                            if (p) allPanels.add(p);
                        });
                    });
                    panelList = Array.from(allPanels);
                }

                const isPanelist = panelList.includes(userName);

                // Get Merged Feedback (Legacy + New Table)
                const feedbackRes = getMergedFeedback(group.id, normType);
                const currentStatuses = feedbackRes.statuses;
                const currentRemarks = feedbackRes.remarks;
                const currentAnnotations = feedbackRes.annotations;

                let titleStatus = {}, preOralStatus = {}, finalStatus = {};
                if (normType.includes('title')) titleStatus = currentStatuses;
                else if (normType.includes('preoral')) preOralStatus = currentStatuses;
                else if (normType.includes('final')) finalStatus = currentStatuses;

                let titleRemarks = {}, preOralRemarks = {}, finalRemarks = {};
                if (normType.includes('title')) titleRemarks = currentRemarks;
                else if (normType.includes('preoral')) preOralRemarks = currentRemarks;
                else if (normType.includes('final')) finalRemarks = currentRemarks;

                let titleAnnotations = {}, preOralAnnotations = {}, finalAnnotations = {};
                if (normType.includes('title')) titleAnnotations = currentAnnotations;
                else if (normType.includes('preoral')) preOralAnnotations = currentAnnotations;
                else if (normType.includes('final')) finalAnnotations = currentAnnotations;

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
                    titleAnnotations, preOralAnnotations, finalAnnotations,

                    // Store raw status info for updates
                    defenseStatusId: feedbackRes.id,
                    currentStatusJson: currentStatuses,
                    currentRemarksJson: currentRemarks,
                    currentAnnotationsJson: currentAnnotations,

                    status: sched ? (sched.status || 'Active') : 'Pending Schedule',
                    isAdviser: isAdviser,
                    isPanelist: isPanelist,
                    projectTitle: group.project_title
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
    const userName = user ? (user.name || user.full_name || 'Instructor') : 'Instructor';

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

        // Sequential Locking: Only applies if the user is a panelist for this group
        if (g.isPanelist && currentRole === 'Panel') {
            if (normCurrentTab === normalizeType('Pre-Oral Defense')) {
                if (!userEvaluations.has(normalizeType('Title Defense'))) {
                    isLocked = true;
                    lockReason = 'Evaluate Title Defense first';
                }
            } else if (normCurrentTab === normalizeType('Final Defense')) {
                if (!userEvaluations.has(normalizeType('Pre-Oral Defense'))) {
                    isLocked = true;
                    lockReason = 'Evaluate Pre-Oral first';
                }
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
                <button onclick="${hasFiles ? `openFileModal('${g.id}')` : ''}" 
                    style="background: ${hasFiles ? 'var(--primary-color)' : '#f1f5f9'}; color: ${hasFiles ? 'white' : '#94a3b8'}; border: none; cursor: ${hasFiles ? 'pointer' : 'default'}; display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 8px; font-weight: 700; font-size: 0.8rem; box-shadow: ${hasFiles ? '0 4px 10px rgba(37, 99, 235, 0.2)' : 'none'}; transition: all 0.2s;"
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

// Global functions for Modal
window.openFileModal = (groupId) => {
    const stringGroupId = String(groupId);
    const normTab = normalizeType(currentTab);

    // Attempt 1: Exact Match (ID + Current Tab)
    let group = allData.find(g => String(g.id) === stringGroupId && normalizeType(g.type) === normTab);
    if (!group) {
        group = allData.find(g => String(g.id) === stringGroupId);
    }
    if (!group) return;

    document.getElementById('modalGroupName').innerText = group.groupName;
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '';

    // Reset Viewer State
    const pdfContainer = document.getElementById('pdfViewerContainer');
    const placeholder = document.getElementById('viewerPlaceholder');
    const saveBtn = document.getElementById('saveAnnotationBtnContainer');

    if (pdfContainer) pdfContainer.style.display = 'none';
    if (placeholder) placeholder.style.display = 'flex';
    if (saveBtn) saveBtn.style.display = 'none';

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
            const isRevised = label.endsWith('_revised');
            let projectTitles = {};
            if (categoryKey === 'titles' && group.projectTitle) {
                try {
                    projectTitles = typeof group.projectTitle === 'string' && group.projectTitle.startsWith('{')
                        ? JSON.parse(group.projectTitle)
                        : { title1: group.projectTitle };
                } catch (e) {
                    projectTitles = { title1: group.projectTitle };
                }
            }

            let displayLabel = label.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            if (categoryKey === 'titles' && projectTitles[label]) {
                displayLabel = projectTitles[label];
            }

            const cleanUrl = url ? url.toString().trim() : "";
            const isNull = !cleanUrl || cleanUrl.toLowerCase() === "null" || (displayLabel && displayLabel.toLowerCase() === "null");

            if (isNull || isRevised) return;

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

            item.innerHTML = `
                <span style="font-size: 0.9rem; font-weight: 500; color: #334155;">${displayLabel}</span>
                <span class="material-icons-round" style="font-size: 18px; color: var(--primary-color);">arrow_forward_ios</span>
            `;

            item.onclick = () => {
                document.querySelectorAll('.file-item').forEach(el => {
                    el.style.background = 'white';
                    if (el.parentElement) el.parentElement.style.borderColor = '#e2e8f0';
                });
                item.style.background = '#f0f9ff';
                itemContainer.style.borderColor = 'var(--primary-color)';
                loadViewer(url, groupId, label);
            };

            itemContainer.appendChild(item);

            // CHANGED: Revised versions logic to match panel
            if (fileObj[label + '_revised']) {
                const revisedUrl = fileObj[label + '_revised'];
                const revItem = document.createElement('div');
                revItem.className = 'file-item';
                revItem.style.padding = '8px 12px';
                revItem.style.cursor = 'pointer';
                revItem.style.display = 'flex';
                revItem.style.alignItems = 'center';
                revItem.style.justifyContent = 'space-between';
                revItem.style.background = '#fffbeb';
                revItem.style.borderTop = '1px dashed #fcd34d';
                revItem.style.transition = 'all 0.2s';

                revItem.innerHTML = `
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span class="material-icons-round" style="font-size: 16px; color: #b45309;">history_edu</span>
                        <span style="font-size: 0.8rem; font-weight: 600; color: #b45309;">Revised Version</span>
                    </div>
                    <span class="material-icons-round" style="font-size: 16px; color: #b45309;">arrow_forward</span>
                `;

                revItem.onclick = () => {
                    document.querySelectorAll('.file-item').forEach(el => el.style.background = 'white');
                    revItem.style.background = '#fcd34d';
                    loadViewer(revisedUrl, groupId, label + '_revised');
                };

                itemContainer.appendChild(revItem);
            }

            const userJson = localStorage.getItem('loginUser');
            const user = userJson ? JSON.parse(userJson) : null;
            const userName = user ? (user.name || user.full_name || 'Instructor') : 'Instructor';

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

            const fileStatuses = typeof currentStatusMap[label] === 'object' ? currentStatusMap[label] : {};
            const fileRemarks = typeof currentRemarksMap[label] === 'object' ? currentRemarksMap[label] : {};

            const myStatus = fileStatuses[userName] || 'Pending';
            const myRemarks = fileRemarks[userName] || '';

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

            if (myStatus === 'Approved' || myStatus === 'Completed') {
                statusColor = '#059669'; statusBg = '#dcfce7'; iconText = 'check_circle';
            } else if (myStatus === 'Approved with Revisions') {
                statusColor = '#d97706'; statusBg = '#fef3c7'; iconText = 'warning';
            } else if (myStatus === 'Rejected' || myStatus === 'Redefend') {
                statusColor = '#dc2626'; statusBg = '#fee2e2'; iconText = 'cancel';
            }

            let optionsHtml = '';
            if (categoryKey === 'titles') {
                optionsHtml = `
                    <option value="Rejected" ${myStatus === 'Rejected' ? 'selected' : ''}>Rejected</option>
                    <option value="Redefend" ${myStatus === 'Redefend' ? 'selected' : ''}>Redefend</option>
                    <option value="Approved with Revisions" ${myStatus === 'Approved with Revisions' ? 'selected' : ''}>Approved with Revisions</option>
                    <option value="Approved" ${myStatus === 'Approved' ? 'selected' : ''}>Approved</option>
                `;
            } else if (categoryKey === 'pre_oral') {
                optionsHtml = `
                    <option value="Redefend" ${myStatus === 'Redefend' ? 'selected' : ''}>Redefend</option>
                    <option value="Approved with Revisions" ${myStatus === 'Approved with Revisions' ? 'selected' : ''}>Approved with Revisions</option>
                    <option value="Approved" ${myStatus === 'Approved' ? 'selected' : ''}>Approved</option>
                `;
            } else if (categoryKey === 'final') {
                optionsHtml = `
                    <option value="Redefend" ${myStatus === 'Redefend' ? 'selected' : ''}>Redefend</option>
                    <option value="Approved with Revisions" ${myStatus === 'Approved with Revisions' ? 'selected' : ''}>Approved with Revisions</option>
                    <option value="Completed" ${myStatus === 'Completed' ? 'selected' : ''}>Completed</option>
                `;
            }

            let interactiveControls = '';
            if (currentRole === 'Panel') {
                interactiveControls = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px;">Your Status</span>
                    <div id="status-badge-${categoryKey}-${label}" style="font-size: 12px; font-weight: 700; color: ${statusColor}; background: ${statusBg}; padding: 4px 8px; border-radius: 99px; display: flex; align-items: center; gap: 4px;">
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
                interactiveControls = `
                    <div style="padding: 8px; background: #f0f9ff; border: 1px dashed #bae6fd; border-radius: 6px; color: #0369a1; font-size: 12px; font-weight: 500; text-align: center; margin-bottom: 10px;">
                        <span class="material-icons-round" style="font-size: 14px; vertical-align: middle; margin-right: 4px;">visibility</span>
                        Viewing as Adviser (Read Only)
                    </div>
                `;
            }

            // Other Panel Feedback
            let panelsToDisplay = [];
            if (currentRole === 'Adviser') {
                panelsToDisplay = Object.keys(fileStatuses);
            } else {
                panelsToDisplay = Object.keys(fileStatuses).filter(p => p !== userName);
            }

            let otherFeedbackHtml = '';
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

            controls.innerHTML = `
                ${interactiveControls}
                ${otherFeedbackHtml}
            `;
            itemContainer.appendChild(controls);
            section.appendChild(itemContainer);
        });

        fileList.appendChild(section);
    };

    if (normTab.includes('title')) {
        createSection('Title Defense', group.files.titles, 'article', 'titles');
    } else if (normTab.includes('preoral')) {
        createSection('Pre-Oral Defense', group.files.pre_oral, 'description', 'pre_oral');
    } else if (normTab.includes('final')) {
        createSection('Final Defense', group.files.final, 'menu_book', 'final');
    }

    document.getElementById('fileModal').style.display = 'flex';
};

window.updateStatus = async (groupId, categoryKey, fileKey, newStatus) => {
    if (newStatus === 'Pending') return;

    const userJson = localStorage.getItem('loginUser');
    const user = userJson ? JSON.parse(userJson) : null;
    const userName = user ? (user.name || user.full_name || 'Instructor') : 'Instructor';

    const select = document.querySelector(`select[onchange*="'${categoryKey}'"][onchange*="'${fileKey}'"]`);
    if (select) { select.disabled = true; select.style.opacity = '0.5'; }

    try {
        const normTab = normalizeType(currentTab);
        const group = allData.find(g => g.id === groupId && normalizeType(g.type) === normTab);
        if (!group) throw new Error('Could not find group data in current view.');

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

        if (fError) throw new Error(fError.message);

        let localMap = group.currentStatusJson || {};
        if (typeof localMap[fileKey] !== 'object') localMap[fileKey] = {};
        localMap[fileKey][userName] = newStatus;

        await supabaseClient
            .from('defense_statuses')
            .upsert({
                group_id: groupId,
                defense_type: group.type,
                statuses: localMap,
                updated_at: new Date()
            }, { onConflict: 'group_id, defense_type' });

        group.currentStatusJson = localMap;

        // --- Real-time Badge Update ---
        const badge = document.getElementById(`status-badge-${categoryKey}-${fileKey}`);
        if (badge) {
            let sColor = '#64748b'; let sBg = '#f1f5f9'; let iText = 'hourglass_empty';
            if (newStatus.includes('Approved')) {
                sColor = '#059669'; sBg = '#dcfce7'; iText = 'check_circle';
            } else if (newStatus.includes('Revisions')) {
                sColor = '#d97706'; sBg = '#fef3c7'; iText = 'warning';
            } else if (newStatus.includes('Rejected') || newStatus.includes('Redefend')) {
                sColor = '#dc2626'; sBg = '#fee2e2'; iText = 'cancel';
            }

            badge.style.color = sColor;
            badge.style.background = sBg;
            badge.innerHTML = `<span class="material-icons-round" style="font-size: 14px;">${iText}</span> ${newStatus}`;
        }

        if (select) {
            select.disabled = false;
            select.style.opacity = '1';
        }
        renderTable();

    } catch (err) {
        console.error('Update Status Critical Error:', err);
        alert('Failed to save status.');
        if (select) { select.disabled = false; select.style.opacity = '1'; }
    }
};

window.saveRemarks = async (groupId, categoryKey, fileKey) => {
    const userJson = localStorage.getItem('loginUser');
    if (!userJson) return;
    const user = JSON.parse(userJson);
    const userName = user.name || user.full_name || 'Instructor';

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
        renderTable();

    } catch (e) {
        console.error('SAVE ERROR:', e);
        if (btn) {
            btn.disabled = false;
            btn.innerText = 'Update Remarks';
        }
    }
};

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
    const saveBtn = document.getElementById('saveAnnotationBtnContainer');
    if (saveBtn) saveBtn.style.display = 'none';

    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
        autoSaveInterval = null;
    }

    const pdfFrame = document.getElementById('pdfFrame');
    if (pdfFrame) pdfFrame.src = "";

    if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = null;
    }

    currentViewerFileKey = null;
    currentViewerGroupId = null;
    currentHighlightedText = "";
};

window.loadViewer = async (url, groupId = null, fileKey = null) => {
    if (!url) return;

    if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = null;
    }

    currentViewerGroupId = groupId;
    currentViewerFileKey = fileKey;
    currentHighlightedText = "";

    const placeholder = document.getElementById('viewerPlaceholder');
    const container = document.getElementById('pdfViewerContainer');
    const pdfFrame = document.getElementById('pdfFrame');
    const saveBtn = document.getElementById('saveAnnotationBtnContainer');

    if (placeholder) {
        placeholder.style.display = 'flex';
        placeholder.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center;">
                <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid var(--primary-color); border-radius: 50%; animation: viewer-spin 1s linear infinite;"></div>
                <p style="margin-top: 15px; font-weight: 500; color: #64748b; font-family: inherit;">Loading file...</p>
            </div>
            <style>
                @keyframes viewer-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
        `;
    }
    if (container) container.style.display = 'none';
    if (saveBtn) saveBtn.style.display = 'none';

    let finalUrl = url.trim();
    if (!finalUrl.startsWith('http') && !finalUrl.startsWith('//')) finalUrl = 'https://' + finalUrl;

    const userJson = localStorage.getItem('loginUser');
    const user = userJson ? JSON.parse(userJson) : null;
    const userName = user ? (user.name || user.full_name || 'Instructor') : 'Instructor';

    if (groupId && fileKey) {
        const normTab = normalizeType(currentTab);
        const group = allData.find(g => String(g.id) === String(groupId) && g.normalizedType === normTab);

        if (group) {
            let annotationsMap = {};
            if (normTab.includes('title')) annotationsMap = group.titleAnnotations || {};
            else if (normTab.includes('preoral')) annotationsMap = group.preOralAnnotations || {};
            else if (normTab.includes('final')) annotationsMap = group.finalAnnotations || {};

            if (annotationsMap[fileKey] && annotationsMap[fileKey][userName]) {
                const urlWithBuster = new URL(annotationsMap[fileKey][userName]);
                urlWithBuster.searchParams.set('t', Date.now());
                finalUrl = urlWithBuster.toString();
            }
        }
    }

    const lowerUrl = finalUrl.toLowerCase();
    const isPDF = lowerUrl.includes('supabase.co') || lowerUrl.endsWith('.pdf');
    const isDrive = lowerUrl.includes('drive.google.com');

    try {
        if (isPDF) {
            const response = await fetch(finalUrl);
            if (!response.ok) throw new Error("Fetch failed");
            const blob = await response.blob();
            currentBlobUrl = URL.createObjectURL(blob);

            const viewerPath = "../../assets/library/web/viewer.html";
            const viewerUrl = `${viewerPath}?file=${encodeURIComponent(currentBlobUrl)}`;

            if (container) container.style.display = 'block';
            if (placeholder) placeholder.style.display = 'none';
            pdfFrame.src = viewerUrl;

            if (autoSaveInterval) clearInterval(autoSaveInterval);
            autoSaveInterval = setInterval(() => { saveAnnotatedPDF(true); }, 2000);
            if (saveBtn) saveBtn.style.display = 'block';

        } else if (isDrive) {
            const fileIdMatch = finalUrl.match(/\/d\/([^\/]+)/) || finalUrl.match(/id=([^\&]+)/);
            const drivePreview = fileIdMatch ? `https://drive.google.com/file/d/${fileIdMatch[1]}/preview` : finalUrl;

            if (container) container.style.display = 'block';
            if (placeholder) placeholder.style.display = 'none';
            pdfFrame.src = drivePreview;

            if (autoSaveInterval) clearInterval(autoSaveInterval);
            if (saveBtn) saveBtn.style.display = 'none';

        } else {
            if (container) container.style.display = 'block';
            if (placeholder) placeholder.style.display = 'none';
            pdfFrame.src = finalUrl;

            if (autoSaveInterval) clearInterval(autoSaveInterval);
            if (saveBtn) saveBtn.style.display = 'none';
        }

    } catch (e) {
        console.warn("Enhanced loading failed, falling back to basic display:", e);
        if (container) container.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
        if (!isDrive && !isPDF) {
            pdfFrame.src = `https://docs.google.com/viewer?url=${encodeURIComponent(finalUrl)}&embedded=true`;
        } else {
            pdfFrame.src = finalUrl;
        }

        if (autoSaveInterval) clearInterval(autoSaveInterval);
        if (saveBtn) saveBtn.style.display = 'none';
    }
};

async function saveAnnotatedPDF(isAuto = false) {
    if (isSaving) return;

    const frame = document.getElementById('pdfFrame');
    const viewerApp = frame ? frame.contentWindow.PDFViewerApplication : null;

    if (!viewerApp || !viewerApp.pdfDocument) return;

    const statusText = document.getElementById('autoSaveText');
    const statusIcon = document.querySelector('#autoSaveStatus span');

    isSaving = true;

    try {
        if (statusText) statusText.innerText = "Auto-saving...";
        if (statusIcon) {
            statusIcon.innerText = "sync";
            statusIcon.style.animation = "viewer-spin 1s linear infinite";
        }

        const data = await viewerApp.pdfDocument.saveDocument();

        const userJson = localStorage.getItem('loginUser');
        const user = JSON.parse(userJson || '{}');
        const userName = user.name || user.full_name || 'Instructor';
        const cleanName = userName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const fileName = `annotated_${currentViewerGroupId}_${currentViewerFileKey}_${cleanName}.pdf`;

        const { data: uploadData, error: uploadError } = await supabaseClient.storage
            .from('project-submissions')
            .upload(`submissions/annotations/${fileName}`, data, {
                contentType: 'application/pdf',
                upsert: true
            });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabaseClient.storage
            .from('project-submissions')
            .getPublicUrl(`submissions/annotations/${fileName}`);

        const { error: dbError } = await supabaseClient
            .from('capstone_feedback')
            .upsert({
                group_id: currentViewerGroupId,
                defense_type: normalizeType(currentTab),
                file_key: currentViewerFileKey,
                user_name: userName,
                annotated_file_url: publicUrl,
                updated_at: new Date().toISOString()
            }, { onConflict: 'group_id, defense_type, file_key, user_name' });

        if (dbError) throw dbError;

        if (allData && currentViewerGroupId) {
            const normTab = normalizeType(currentTab);
            const groupEntry = allData.find(g => String(g.id) === String(currentViewerGroupId) && g.normalizedType === normTab);

            if (groupEntry) {
                let annotKey = "";
                if (normTab.includes('title')) annotKey = "titleAnnotations";
                else if (normTab.includes('preoral')) annotKey = "preOralAnnotations";
                else if (normTab.includes('final')) annotKey = "finalAnnotations";

                if (annotKey) {
                    if (!groupEntry[annotKey]) groupEntry[annotKey] = {};
                    if (!groupEntry[annotKey][currentViewerFileKey]) groupEntry[annotKey][currentViewerFileKey] = {};
                    groupEntry[annotKey][currentViewerFileKey][userName] = publicUrl;
                }
            }
        }

        if (statusText) statusText.innerText = "Changes Auto-saved";
        if (statusIcon) {
            statusIcon.innerText = "sync_lock";
            statusIcon.style.animation = "none";
        }

    } catch (err) {
        console.error('Auto-save Error:', err);
    } finally {
        isSaving = false;
    }
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
