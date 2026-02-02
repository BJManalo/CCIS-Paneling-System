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
    const userName = user ? (user.name || user.full_name || 'Panel') : 'Panel';

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

        // We check if THIS user (Panel) has evaluated the group for a specific stage.
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

        // 4. Fetch Defense Statuses, Feedback, AND Annotations
        let defStatuses = [];
        let capstoneFeedback = [];
        let capstoneAnnotations = [];

        try {
            const [dsRes, cfRes, caRes] = await Promise.all([
                supabaseClient.from('defense_statuses').select('*'),
                supabaseClient.from('capstone_feedback').select('*'),
                supabaseClient.from('capstone_annotations').select('*')
            ]);

            if (dsRes.error) console.error('Error fetching defense_statuses:', dsRes.error);
            if (cfRes.error) console.error('DATABASE ERROR (capstone_feedback):', cfRes.error);
            if (caRes.error) console.error('DATABASE ERROR (capstone_annotations):', caRes.error);

            defStatuses = dsRes.data || [];
            capstoneFeedback = cfRes.data || [];
            capstoneAnnotations = caRes.data || [];
            console.log('LOAD SUCCESS:', { statuses: defStatuses.length, feedback: capstoneFeedback.length, annotations: capstoneAnnotations.length });
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
                // Fallback: Read annotation from feedback table if it exists there (Legacy)
                if (cf.annotated_file_url) annotations[cf.file_key][cf.user_name] = cf.annotated_file_url;
            });

            // 3. Merge Annotations from New Table (capstone_annotations) - Primary Source
            capstoneAnnotations.filter(ca => ca.group_id == groupId && normalizeType(ca.defense_type) === norm).forEach(ca => {
                if (!annotations[ca.file_key]) annotations[ca.file_key] = {};
                annotations[ca.file_key][ca.user_name] = ca.annotated_file_url;
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

        // FILTER HIDDEN/NULL FILES (Fix for Unfinished/Finished Tab)
        const fileKeys = Object.keys(currentFileSet).filter(key => {
            const url = currentFileSet[key];
            if (key.endsWith('_revised')) return false;
            if (!url || String(url).trim().toLowerCase() === 'null') return false;
            return true;
        });
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
        if (g.isPanelist) {
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

            // SKIP: If URL is missing/null, title is "Null", or it's a revised key
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
                    el.parentElement.style.borderColor = '#e2e8f0';
                });
                item.style.background = '#f0f9ff';
                itemContainer.style.borderColor = 'var(--primary-color)';
                loadViewer(url, groupId, label);
            };

            itemContainer.appendChild(item);

            // CHECK FOR REVISED VERSION
            if (fileObj[label + '_revised']) {
                const revisedUrl = fileObj[label + '_revised'];
                const revItem = document.createElement('div');
                revItem.className = 'file-item';
                revItem.style.padding = '8px 12px';
                revItem.style.cursor = 'pointer';
                revItem.style.display = 'flex';
                revItem.style.alignItems = 'center';
                revItem.style.justifyContent = 'space-between';
                revItem.style.background = '#fffbeb'; // Amber-50
                revItem.style.borderTop = '1px dashed #fcd34d'; // Amber-300
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
                    revItem.style.background = '#fcd34d'; // Amber-300 active
                    loadViewer(revisedUrl, groupId, label + '_revised');
                };

                itemContainer.appendChild(revItem);
            }

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

            let myStatus = fileStatuses[userName] || 'Pending';
            if (myStatus === 'Approve') myStatus = 'Approved';
            if (myStatus === 'Approve with Revisions') myStatus = 'Approved with Revisions';
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

            if (myStatus === 'Approved' || myStatus === 'Completed') {
                statusColor = '#059669'; statusBg = '#dcfce7'; iconText = 'check_circle';
            } else if (myStatus === 'Approved with Revisions') {
                statusColor = '#d97706'; statusBg = '#fef3c7'; iconText = 'warning';
            } else if (myStatus === 'Rejected' || myStatus === 'Redefend') {
                statusColor = '#dc2626'; statusBg = '#fee2e2'; iconText = 'cancel';
            }

            let optionsHtml = '';
            // ... (option generation omitted for brevity if not used in read-only)

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
        // We must fetch the current row first to avoid overwriting other file keys!
        const { data: existingRow } = await supabaseClient
            .from('defense_statuses')
            .select('statuses')
            .eq('group_id', groupId)
            .eq('defense_type', group.type)
            .single();

        let mergedStatuses = existingRow && existingRow.statuses ? (typeof existingRow.statuses === 'string' ? JSON.parse(existingRow.statuses) : existingRow.statuses) : {};
        if (typeof mergedStatuses !== 'object') mergedStatuses = {};

        // Ensure file key object exists
        if (!mergedStatuses[fileKey]) mergedStatuses[fileKey] = {};
        mergedStatuses[fileKey][userName] = newStatus;

        const { error: dsError } = await supabaseClient
            .from('defense_statuses')
            .upsert({
                group_id: groupId,
                defense_type: group.type,
                statuses: mergedStatuses,
                updated_at: new Date()
            }, { onConflict: 'group_id, defense_type' });

        if (dsError) console.warn('Legacy status update failed (non-critical):', dsError);

        // Update local object and refresh UI
        group.currentStatusJson = mergedStatuses;

        // Ensure stage-specific statuses are also updated for immediate modal feedback
        if (normTab.includes('title')) group.titleStatus = mergedStatuses;
        else if (normTab.includes('preoral')) group.preOralStatus = mergedStatuses;
        else if (normTab.includes('final')) group.finalStatus = mergedStatuses;

        // --- Real-time Badge Update ---
        const badge = document.getElementById(`status-badge-${categoryKey}-${fileKey}`);
        if (badge) {
            let sColor = '#64748b'; let sBg = '#f1f5f9'; let iText = 'hourglass_empty';
            if (newStatus.includes('Approved')) {
                sColor = '#059669'; sBg = '#dcfce7'; iText = 'check_circle';
            } else if (newStatus.includes('Approve with Revisions')) {
                sColor = '#d97706'; sBg = '#fef3c7'; iText = 'warning';
            } else if (newStatus.includes('Rejected') || newStatus.includes('Redefense')) {
                sColor = '#dc2626'; sBg = '#fee2e2'; iText = 'cancel';
            }

            badge.style.color = sColor;
            badge.style.background = sBg;
            badge.innerHTML = `<span class="material-icons-round" style="font-size: 14px;">${iText}</span> ${newStatus}`;
        }

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
        // Fetch fresh data to merge properly
        const { data: existingRow } = await supabaseClient
            .from('defense_statuses')
            .select('statuses, remarks')
            .eq('group_id', groupId)
            .eq('defense_type', group.type)
            .single();

        let mergedStatuses = existingRow && existingRow.statuses ? (typeof existingRow.statuses === 'string' ? JSON.parse(existingRow.statuses) : existingRow.statuses) : {};
        if (typeof mergedStatuses !== 'object') mergedStatuses = {};
        if (!mergedStatuses[fileKey]) mergedStatuses[fileKey] = {};
        mergedStatuses[fileKey][userName] = currentSelectedStatus;

        let mergedRemarks = existingRow && existingRow.remarks ? (typeof existingRow.remarks === 'string' ? JSON.parse(existingRow.remarks) : existingRow.remarks) : {};
        if (typeof mergedRemarks !== 'object') mergedRemarks = {};
        if (!mergedRemarks[fileKey]) mergedRemarks[fileKey] = {};
        mergedRemarks[fileKey][userName] = `${userName}: ${newText}`;

        await supabaseClient
            .from('defense_statuses')
            .upsert({
                group_id: groupId,
                defense_type: group.type,
                statuses: mergedStatuses,
                remarks: mergedRemarks,
                updated_at: new Date()
            }, { onConflict: 'group_id, defense_type' });

        // Update local state to reflect changes immediately
        group.currentStatusJson = mergedStatuses;
        group.currentRemarksJson = mergedRemarks;

        // Success Feedback
        // Update specific view maps as well for immediate render
        if (normTab.includes('title')) {
            group.titleStatus = mergedStatuses;
            group.titleRemarks = mergedRemarks;
        } else if (normTab.includes('preoral')) {
            group.preOralStatus = mergedStatuses;
            group.preOralRemarks = mergedRemarks;
        } else if (normTab.includes('final')) {
            group.finalStatus = mergedStatuses;
            group.finalRemarks = mergedRemarks;
        }

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
    const saveBtn = document.getElementById('saveAnnotationBtnContainer');
    if (saveBtn) saveBtn.style.display = 'none';

    // Clear auto-save
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
        autoSaveInterval = null;
    }

    // Clear iframe
    const pdfFrame = document.getElementById('pdfFrame');
    if (pdfFrame) pdfFrame.src = "";

    // Revoke blob if exists
    if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = null;
    }

    currentViewerFileKey = null;
    currentViewerGroupId = null;
    currentHighlightedText = "";
};

// --- PDF.js CORE VIEWER ---
window.loadViewer = async (url, groupId = null, fileKey = null) => {
    if (!url) {
        console.error("loadViewer: No URL provided");
        return;
    }

    // Revoke previous blob if exists
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

    // Show loading state
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

    // Resolve URL (check for existing annotations)
    let finalUrl = url.trim();
    if (!finalUrl.startsWith('http') && !finalUrl.startsWith('//')) finalUrl = 'https://' + finalUrl;

    const userJson = localStorage.getItem('loginUser');
    const user = userJson ? JSON.parse(userJson) : null;
    const userName = user ? (user.name || user.full_name || 'Panel') : 'Panel';

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
                console.log("Loading annotation version");
                finalUrl = urlWithBuster.toString();
            }
        }
    }

    const lowerUrl = finalUrl.toLowerCase();
    const isPDF = lowerUrl.includes('supabase.co') || lowerUrl.endsWith('.pdf');
    const isDrive = lowerUrl.includes('drive.google.com');

    try {
        if (isPDF) {
            console.log("Loading PDF via PDF.js...");
            const response = await fetch(finalUrl);
            if (!response.ok) throw new Error("Fetch failed");
            const blob = await response.blob();
            currentBlobUrl = URL.createObjectURL(blob);

            const viewerPath = "../../assets/library/web/viewer.html";
            const viewerUrl = `${viewerPath}?file=${encodeURIComponent(currentBlobUrl)}`;

            if (container) container.style.display = 'block';
            if (placeholder) placeholder.style.display = 'none';
            pdfFrame.src = viewerUrl;

            // Enable Auto-save for PDFs ONLY
            if (autoSaveInterval) clearInterval(autoSaveInterval);
            autoSaveInterval = setInterval(() => { saveAnnotatedPDF(true); }, 2000);
            if (saveBtn) saveBtn.style.display = 'block';

        } else if (isDrive) {
            console.log("Loading Google Drive link...");
            const fileIdMatch = finalUrl.match(/\/d\/([^\/]+)/) || finalUrl.match(/id=([^\&]+)/);
            const drivePreview = fileIdMatch ? `https://drive.google.com/file/d/${fileIdMatch[1]}/preview` : finalUrl;

            if (container) container.style.display = 'block';
            if (placeholder) placeholder.style.display = 'none';
            pdfFrame.src = drivePreview;

            if (autoSaveInterval) clearInterval(autoSaveInterval);
            if (saveBtn) saveBtn.style.display = 'none';

        } else {
            console.log("Loading generic link...");
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

        // Final fallback: try Google Docs viewer for any link
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
    if (isSaving) return; // Prevent concurrent saves

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

        // 1. Get the annotated PDF bytes from PDF.js
        const data = await viewerApp.pdfDocument.saveDocument();

        // 2. Prepare file metadata
        const userJson = localStorage.getItem('loginUser');
        const user = JSON.parse(userJson || '{}');
        const userName = user.name || user.full_name || 'Panel';
        // Stable filename to overwrite instead of creating new files
        const cleanName = userName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const fileName = `annotated_${currentViewerGroupId}_${currentViewerFileKey}_${cleanName}.pdf`;

        // 3. Upload to Supabase Storage (upsert: true to overwrite)
        const { data: uploadData, error: uploadError } = await supabaseClient.storage
            .from('project-submissions')
            .upload(`submissions/annotations/${fileName}`, data, {
                contentType: 'application/pdf',
                upsert: true
            });

        if (uploadError) throw uploadError;

        // 4. Get the Public URL
        const { data: { publicUrl } } = supabaseClient.storage
            .from('project-submissions')
            .getPublicUrl(`submissions/annotations/${fileName}`);

        // 5. Save the link to the 'capstone_annotations' table (New Separate Table)
        const { error: dbError } = await supabaseClient
            .from('capstone_annotations')
            .upsert({
                group_id: currentViewerGroupId,
                defense_type: normalizeType(currentTab),
                file_key: currentViewerFileKey,
                user_name: userName,
                annotated_file_url: publicUrl,
                updated_at: new Date().toISOString()
            }, { onConflict: 'group_id, defense_type, file_key, user_name' });

        if (dbError) {
            console.error("Database upsert failed:", dbError);
            throw dbError;
        }

        // --- Local Sync: Ensure the current session knows about the save ---
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
                    console.log(`Synced ${annotKey} locally:`, publicUrl);
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
        if (statusText) statusText.innerText = "Auto-save failed";
        if (statusIcon) {
            statusIcon.innerText = "error_outline";
            statusIcon.style.animation = "none";
        }
    } finally {
        isSaving = false;
    }
}

// --- (Obsolete manual rendering functions removed) ---

// --- HIGHLIGHT DETECTION (Real-time Sync & Clean Version) ---
// --- (Global mouseup listener removed, handled by iframe) ---

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

