var PROJECT_URL = PROJECT_URL || 'https://oddzwiddvniejcawzpwi.supabase.co';
var PUBLIC_KEY = PUBLIC_KEY || 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
var supabaseClient = supabaseClient || window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

let allData = [];
let filteredGroups = [];
let currentTab = 'Title Defense'; // Default
let currentProgram = 'ALL';
let searchTerm = '';
let groupGrades = {}; // Map: groupId -> Set of graded/evaluated types
let currentStatusFilter = 'ALL';
let currentPage = 1;
const rowsPerPage = 15;

window.showToast = function (message, type = 'info') {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.innerHTML = `<span id="toastIcon" class="material-icons-round">info</span><span id="toastMessage"></span>`;
        toast.style = "position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: #334155; color: white; padding: 12px 24px; border-radius: 12px; display: flex; align-items: center; gap: 10px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); z-index: 10000; font-weight: 600; display: none;";
        document.body.appendChild(toast);
    }

    document.getElementById('toastMessage').textContent = message;

    // Optional: change icon/color based on type
    const icon = document.getElementById('toastIcon');
    if (type === 'success') {
        icon.textContent = 'check_circle';
        toast.style.background = '#10b981'; // Green
    } else if (type === 'error') {
        icon.textContent = 'error';
        toast.style.background = '#ef4444'; // Red
    } else {
        icon.textContent = 'info';
        toast.style.background = '#334155'; // Slate
    }

    toast.style.display = 'flex';
    setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

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

let currentRole = 'All'; // Default to All Groups as requested
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
    const role = (user && user.role) ? user.role.trim().toLowerCase() : '';
    const allowedRoles = ['instructor', 'instructor/adviser', 'adviser'];
    if (!user || !allowedRoles.includes(role)) {
        window.location.href = '../../';
        return;
    }

    // Ultra-Aggressive Eval Hide for Adviser-only
    const rawRole = (user && user.role) ? user.role.toString().toLowerCase() : '';
    const isAdviser = rawRole.includes('adviser') || rawRole.includes('advisor');
    const hasOtherRole = rawRole.includes('instructor') || rawRole.includes('panel') || rawRole.includes('admin');

    if (isAdviser && !hasOtherRole) {
        document.querySelectorAll('.nav-item, a').forEach(nav => {
            const href = (nav.getAttribute('href') || '').toLowerCase();
            const text = (nav.textContent || '').toLowerCase();
            if (href.includes('evaluation') || text.includes('evaluation')) {
                nav.style.setProperty('display', 'none', 'important');
            }
        });
    }

    const userName = user ? (user.name || user.full_name || 'Instructor') : 'Instructor';

    tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 40px;">Loading capstone data...</td></tr>';
    if (emptyState) emptyState.style.display = 'none';

    try {
        // 1. Fetch Student Groups
        const { data: groups, error: gError } = await supabaseClient
            .from('student_groups')
            .select('*')
            .order('created_at', { ascending: false });

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
        let capstoneAnnotations = [];

        try {
            const [dsRes, cfRes, caRes] = await Promise.all([
                supabaseClient.from('defense_statuses').select('*'),
                supabaseClient.from('capstone_feedback').select('*'),
                supabaseClient.from('capstone_annotations').select('*')
            ]);

            if (dsRes.error) console.error('Error fetching defense_statuses:', dsRes.error);
            defStatuses = dsRes.data || [];
            capstoneFeedback = cfRes.data || [];
            capstoneAnnotations = caRes.data || [];
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

            // 3. Merge Annotations from New Table (capstone_annotations) - Primary Source
            capstoneAnnotations.filter(ca => ca.group_id == groupId && ca.defense_type.toLowerCase().replace(/[^a-z0-9]/g, '') === norm).forEach(ca => {
                if (!annotations[ca.file_key] || typeof annotations[ca.file_key] !== 'object') annotations[ca.file_key] = {};
                if (ca.annotated_file_url) annotations[ca.file_key][ca.user_name] = ca.annotated_file_url;
            });

            return { statuses, remarks, annotations, id: legacy ? legacy.id : null };
        };

        // 5. Process Data
        allData = [];

        groups.forEach(group => {
            const userNameNormalized = String(user.name || user.full_name || 'Instructor').trim().toLowerCase();
            const userEmailNormalized = String(user.email || '').trim().toLowerCase();

            const robustMatch = (nameA, nameB) => {
                const nA = String(nameA || "").trim().toLowerCase();
                const nB = String(nameB || "").trim().toLowerCase();
                if (!nA || !nB) return false;
                if (nA === nB) return true;

                // Strip creator info
                const cleanA = nA.replace(/\(creator:.*?\)/g, '').trim();
                if (cleanA === nB) return true;

                // Exact word match (prevents "instructor" matching "instructor bob")
                const wA = cleanA.split(/\s+/).filter(w => w);
                const wB = nB.split(/\s+/).filter(w => w);
                if (wA.length > 0 && wA.length === wB.length) {
                    if (wA.every(word => wB.includes(word))) return true;
                }

                return false;
            };

            const isAdviser = robustMatch(group.adviser, userNameNormalized) || robustMatch(group.adviser, userEmailNormalized);

            const groupDefenses = {};
            const defenseTypes = ['Title Defense', 'Pre-Oral Defense', 'Final Defense'];
            let hasAnyActivity = false;

            defenseTypes.forEach(defType => {
                const normType = normalizeType(defType);
                const sched = schedules.find(s => s.group_id === group.id && normalizeType(s.schedule_type) === normType);

                const parseFileField = (val, defaultLabel) => {
                    if (!val) return {};
                    if (typeof val === 'object') return val;
                    try {
                        if (typeof val === 'string' && val.trim().startsWith('{')) return JSON.parse(val);
                        return { [defaultLabel]: val };
                    } catch (e) {
                        return { [defaultLabel]: val };
                    }
                };

                let filesObj = {};
                if (normType.includes('title')) filesObj = parseFileField(group.title_link, 'Title Proposal');
                else if (normType.includes('preoral')) filesObj = parseFileField(group.pre_oral_link, 'Pre-Oral Document');
                else if (normType.includes('final')) filesObj = parseFileField(group.final_link, 'Final Manuscript');

                if (sched || Object.keys(filesObj).length > 0) hasAnyActivity = true;

                let panelList = sched ? [sched.panel1, sched.panel2, sched.panel3, sched.panel4, sched.panel5].filter(p => p) : [];

                const feedbackRes = getMergedFeedback(group.id, normType);

                groupDefenses[normType] = {
                    type: sched ? sched.schedule_type : defType,
                    date: sched ? sched.schedule_date : null,
                    time: sched ? sched.schedule_time : null,
                    venue: sched ? sched.schedule_venue : 'Online / TBA',
                    panels: panelList,
                    files: filesObj,
                    statuses: feedbackRes.statuses,
                    remarks: feedbackRes.remarks,
                    annotations: feedbackRes.annotations,
                    defenseStatusId: feedbackRes.id,
                    status: sched ? (sched.status || 'Active') : 'Pending Schedule'
                };
            });

            if (!hasAnyActivity) return;

            const allGroupSchedules = schedules.filter(s => s.group_id === group.id);
            const allPanels = new Set();
            allGroupSchedules.forEach(s => {
                [s.panel1, s.panel2, s.panel3, s.panel4, s.panel5].forEach(p => { if (p) allPanels.add(p); });
            });
            const isPanelist = Array.from(allPanels).some(p => robustMatch(p, userNameNormalized) || robustMatch(p, userEmailNormalized));

            allData.push({
                id: group.id,
                groupName: group.group_name,
                program: (group.program || '').toUpperCase(),
                yearLevel: group.year_level || '',
                section: group.section || '',
                adviser: group.adviser || 'Not Assigned',
                isAdviser: isAdviser,
                isPanelist: isPanelist,
                projectTitle: group.project_title,
                defenses: groupDefenses
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
    currentPage = 1;
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
    currentPage = 1;
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

    // Filters
    filteredGroups = allData.filter(g => {
        const programMatch = currentProgram === 'ALL' || g.program === currentProgram;

        let sectionMatch = true;
        if (currentSectionFilter !== 'ALL') {
            const gSec = (g.yearLevel && g.section) ? `${g.yearLevel}${g.section}` : (g.section || '');
            if (gSec !== currentSectionFilter) sectionMatch = false;
        }

        const searchMatch = !searchTerm || g.groupName.toLowerCase().includes(searchTerm.toLowerCase());
        const roleMatch = (currentRole === 'All') ||
            (currentRole === 'Adviser' && g.isAdviser) ||
            (currentRole === 'Panel' && g.isPanelist);

        if (!programMatch || !sectionMatch || !searchMatch || !roleMatch) return false;

        // Skip Finished filter since that was tab-based, defaulting to all for now
        if (currentStatusFilter === 'ALL') return true;
        return true;
    });

    const totalPages = Math.ceil(filteredGroups.length / rowsPerPage);
    if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * rowsPerPage;
    const paginatedGroups = filteredGroups.slice(startIndex, startIndex + rowsPerPage);

    if (paginatedGroups.length === 0) {
        if (emptyState) emptyState.style.display = 'flex';
        updatePaginationUI(totalPages);
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    paginatedGroups.forEach(g => {
        const progClass = g.program.includes('BSIS') ? 'prog-bsis' : g.program.includes('BSIT') ? 'prog-bsit' : g.program.includes('BSCS') ? 'prog-bscs' : 'prog-unknown';

        let accordionContentHtml = `
            <div class="defense-tabs" style="display:flex; border-bottom:1px solid #e2e8f0; margin-bottom:15px; background: white;">
                <button onclick="switchInnerTab('titledefense', '${g.id}', event)" class="inner-tab active inner-tab-${g.id}" id="tab-titledefense-${g.id}" style="padding:10px 20px; background:none; border:none; border-bottom:3px solid var(--primary-color); color:var(--primary-color); font-weight:700; cursor:pointer;">Title Defense</button>
                <button onclick="switchInnerTab('preoraldefense', '${g.id}', event)" class="inner-tab inner-tab-${g.id}" id="tab-preoraldefense-${g.id}" style="padding:10px 20px; background:none; border:none; border-bottom:3px solid transparent; color:#64748b; font-weight:500; cursor:pointer;">Pre-Oral Defense</button>
                <button onclick="switchInnerTab('finaldefense', '${g.id}', event)" class="inner-tab inner-tab-${g.id}" id="tab-finaldefense-${g.id}" style="padding:10px 20px; background:none; border:none; border-bottom:3px solid transparent; color:#64748b; font-weight:500; cursor:pointer;">Final Defense</button>
            </div>
            <div style="background:white; padding:15px; border-radius:8px; border:1px solid #e2e8f0;">
        `;

        ['titledefense', 'preoraldefense', 'finaldefense'].forEach((defKey, idx) => {
            const d = g.defenses[defKey];
            const isActive = idx === 0 ? 'display:block;' : 'display:none;';
            const panelsHtml = d && d.panels && d.panels.length > 0 ? d.panels.map(p => `<span class="chip" style="margin-right:5px; margin-bottom:5px; display:inline-block;">${p}</span>`).join('') : '<span style="color:#94a3b8; font-style:italic; font-size:11px;">Not Assigned</span>';
            const dateStr = d && d.date ? new Date(d.date).toLocaleDateString() : '-';
            const timeStr = d && d.time ? formatTime12Hour(d.time) : '-';
            const venueStr = d && d.venue ? d.venue : 'TBA';
            const hasFiles = d && d.files && Object.keys(d.files).length > 0;

            const actionBtn = `
                <button onclick="${hasFiles ? `openFileModal('${g.id}', '${defKey}')` : ''}" 
                    style="background: ${hasFiles ? 'var(--primary-color)' : '#f1f5f9'}; color: ${hasFiles ? 'white' : '#94a3b8'}; border: none; cursor: ${hasFiles ? 'pointer' : 'default'}; display: inline-flex; align-items: center; justify-content: center; width: 100%; gap: 8px; padding: 10px 16px; border-radius: 8px; font-weight: 700; font-size: 0.85rem; transition: all 0.2s; box-shadow: ${hasFiles ? '0 4px 10px rgba(37, 99, 235, 0.2)' : 'none'};">
                    <span class="material-icons-round" style="font-size: 18px;">${hasFiles ? 'folder_open' : 'folder_off'}</span>
                    <span>${hasFiles ? 'View Files' : 'No Files'}</span>
                </button>
             `;

            accordionContentHtml += `
                <div class="inner-content inner-content-${g.id}" id="content-${defKey}-${g.id}" style="${isActive}">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap: 20px;">
                        <div style="flex:1;">
                            <div style="margin-bottom:12px; display:flex; align-items:center; gap:8px;">
                                <span class="material-icons-round" style="color:#64748b; font-size:18px;">event</span> 
                                <strong>Date & Time:</strong> 
                                <span style="color:#334155;">${dateStr}</span> <span style="margin-left:5px; color:#64748b; font-size: 0.9em;">(${timeStr})</span>
                            </div>
                            <div style="margin-bottom:12px; display:flex; align-items:center; gap:8px;">
                                <span class="material-icons-round" style="color:#64748b; font-size:18px;">place</span> 
                                <strong>Venue:</strong> 
                                <span style="color:#334155;">${venueStr}</span>
                            </div>
                            <div style="margin-bottom:8px; display:flex; align-items:flex-start; gap:8px;">
                                <span class="material-icons-round" style="color:#64748b; font-size:18px; margin-top:2px;">groups</span> 
                                <strong>Panels:</strong>
                            </div>
                            <div style="padding-left: 26px;">${panelsHtml}</div>
                        </div>
                        <div style="width:200px;">
                            ${actionBtn}
                        </div>
                    </div>
                </div>
            `;
        });

        accordionContentHtml += `</div>`;

        const mainRow = document.createElement('tr');
        mainRow.style.cursor = 'pointer';
        mainRow.onclick = () => {
            const acc = document.getElementById(`accordion-${g.id}`);
            const icon = document.getElementById(`icon-${g.id}`);
            if (acc.style.display === 'none') {
                acc.style.display = 'table-row';
                icon.style.transform = 'rotate(180deg)';
                mainRow.style.background = '#f8fafc';
            } else {
                acc.style.display = 'none';
                icon.style.transform = 'rotate(0deg)';
                mainRow.style.background = 'white';
            }
        };

        const groupAdviser = g.adviser !== 'Not Assigned' ? g.adviser.replace(/\(creator:[^)]+\)/, '').trim() : 'Not Assigned';

        mainRow.innerHTML = `
            <td>
                <div style="font-weight: 700; font-size:1.05rem; color:#0f172a;">${g.groupName}</div>
                <div style="font-size: 12px; color: #64748b; margin-top: 4px; font-weight:500;">${g.isAdviser ? 'Adviser View' : (g.isPanelist ? 'Panel View' : '')}</div>
            </td>
            <td><span class="prog-badge ${progClass}">${g.program}</span></td>
            <td>
                <div style="font-size: 0.95rem; font-weight: 500; color: #334155; display:flex; align-items:center; gap:6px;">
                    <span class="material-icons-round" style="font-size:16px; color:#94a3b8;">school</span>
                    ${groupAdviser}
                </div>
            </td>
            <td style="text-align:right; padding-right:20px;">
                <span class="material-icons-round expand-icon" id="icon-${g.id}" style="color:#94a3b8; transition:transform 0.3s; pointer-events:none; font-size: 24px;">expand_more</span>
            </td>
        `;

        const accRow = document.createElement('tr');
        accRow.id = `accordion-${g.id}`;
        accRow.style.display = 'none';
        accRow.style.background = '#f8fafc';
        accRow.innerHTML = `
            <td colspan="4" style="padding: 20px 25px; border-bottom: 2px solid #e2e8f0; background: #f8fbff;">
                ${accordionContentHtml}
            </td>
        `;

        tableBody.appendChild(mainRow);
        tableBody.appendChild(accRow);
    });

    updatePaginationUI(totalPages);
}

window.switchInnerTab = (tabKey, groupId, event) => {
    event.stopPropagation();
    document.querySelectorAll('.inner-content-' + groupId).forEach(el => el.style.display = 'none');
    document.querySelectorAll('.inner-tab-' + groupId).forEach(el => {
        el.style.color = '#64748b';
        el.style.borderBottomColor = 'transparent';
        el.style.fontWeight = '500';
    });

    document.getElementById('content-' + tabKey + '-' + groupId).style.display = 'block';

    const activeTab = document.getElementById('tab-' + tabKey + '-' + groupId);
    activeTab.style.color = 'var(--primary-color)';
    activeTab.style.borderBottomColor = 'var(--primary-color)';
    activeTab.style.fontWeight = '700';
};

window.changePage = (newPage) => {
    currentPage = newPage;
    renderTable();
};

function updatePaginationUI(totalPages) {
    let paginationContainer = document.querySelector('.pagination');
    if (!paginationContainer) return;

    if (totalPages <= 1) {
        paginationContainer.style.display = 'none';
        return;
    }

    paginationContainer.style.display = 'flex';

    paginationContainer.innerHTML = `
        <button class="page-btn prev" ${currentPage === 1 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : `onclick="changePage(${currentPage - 1})"`}>Previous</button>
        <span class="page-number active">${currentPage}</span>
        <button class="page-btn next" ${currentPage === totalPages ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : `onclick="changePage(${currentPage + 1})"`}>Next</button>
    `;
}

// Global functions for Modal
window.openFileModal = (groupId, defKey) => {
    // Prevent event capturing if attached to row, but its attached to button so it's fine
    if (window.event) window.event.stopPropagation();

    const stringGroupId = String(groupId);
    let group = allData.find(g => String(g.id) === stringGroupId);
    if (!group || !group.defenses[defKey]) return;

    let selectedDefense = group.defenses[defKey];

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
                if (typeof group.projectTitle === 'object') {
                    projectTitles = group.projectTitle;
                } else {
                    try {
                        projectTitles = typeof group.projectTitle === 'string' && group.projectTitle.trim().startsWith('{')
                            ? JSON.parse(group.projectTitle)
                            : { title1: group.projectTitle };
                    } catch (e) {
                        projectTitles = { title1: group.projectTitle };
                    }
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

                // Mobile View Switch
                const content = document.getElementById('fileModalContent');
                if (content) {
                    content.classList.remove('view-mode-list');
                    content.classList.add('view-mode-file');
                }

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

                    // Mobile View Switch
                    const content = document.getElementById('fileModalContent');
                    if (content) {
                        content.classList.remove('view-mode-list');
                        content.classList.add('view-mode-file');
                    }

                    loadViewer(revisedUrl, groupId, label + '_revised');
                };

                itemContainer.appendChild(revItem);
            }

            const userJson = localStorage.getItem('loginUser');
            const user = userJson ? JSON.parse(userJson) : null;
            const userName = user ? (user.name || user.full_name || 'Instructor') : 'Instructor';

            let currentStatusMap = selectedDefense.statuses || {};
            let currentRemarksMap = selectedDefense.remarks || {};

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
                    <option value="Approved with Revisions" ${myStatus === 'Approved with Revisions' ? 'selected' : ''}>Approved with Revisions</option>
                    <option value="Approved" ${myStatus === 'Approved' ? 'selected' : ''}>Approved</option>
                `;
            } else if (categoryKey === 'final') {
                optionsHtml = `
                    <option value="Approved with Revisions" ${myStatus === 'Approved with Revisions' ? 'selected' : ''}>Approved with Revisions</option>
                    <option value="Completed" ${myStatus === 'Completed' ? 'selected' : ''}>Completed</option>
                `;
            }

            let interactiveControls = '';
            // Allow grading if role is Panel OR (All/Panelist and NOT Adviser view)
            const canGrade = (currentRole === 'Panel' || (currentRole === 'All' && group.isPanelist));

            if (canGrade) {
                const groupAdviserStatus = group.adviser_status || {};
                let requiredKeys = [];
                if (categoryKey === 'titles') requiredKeys = ['title1', 'title2', 'title3'];
                else if (categoryKey === 'pre_oral') requiredKeys = ['ch1', 'ch2', 'ch3'];
                else if (categoryKey === 'final') requiredKeys = ['ch4', 'ch5'];

                const isSentToPanel = requiredKeys.length > 0 && requiredKeys.every(key => groupAdviserStatus[key] === 'Approved');

                if (currentRole === 'Panel' && !isSentToPanel) {
                    interactiveControls = `
                        <div style="padding: 12px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; color: #b45309; font-size: 12px; font-weight: 500; text-align: center; margin-bottom: 10px;">
                            <span class="material-icons-round" style="font-size: 14px; vertical-align: middle; margin-right: 4px;">hourglass_empty</span>
                            Waiting for Adviser to approve all required documents before Panel Evaluation.
                        </div>
                    `;
                } else {
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
                `;
                }
            } else if (group.isAdviser) {
                const groupAdviserStatus = group.adviser_status || {};
                const currentAdvStatus = groupAdviserStatus[label] || 'Pending';
                const groupAdviserRemarks = group.adviser_remarks || {};
                const currentAdvRemarks = groupAdviserRemarks[label] || '';

                interactiveControls = `
                    <div style="padding: 12px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; margin-bottom: 10px;">
                        <div style="font-size: 0.75rem; font-weight: 700; color: #0369a1; text-transform: uppercase; margin-bottom: 8px; display: flex; align-items: center; gap: 5px;">
                            <span class="material-icons-round" style="font-size: 16px;">verified_user</span>
                            Adviser Approval
                        </div>
                        <div style="display: flex; gap: 8px; margin-bottom: 10px;">
                            <button onclick="updateAdviserStatus(${group.id}, '${label}', 'Approved')" 
                                style="flex: 1; background: ${currentAdvStatus === 'Approved' ? '#059669' : 'white'}; color: ${currentAdvStatus === 'Approved' ? 'white' : '#059669'}; border: 1px solid #059669; padding: 8px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
                                <span class="material-icons-round" style="font-size: 16px;">check_circle</span> Approve
                            </button>
                            <button onclick="updateAdviserStatus(${group.id}, '${label}', 'Declined')" 
                                style="flex: 1; background: ${currentAdvStatus === 'Declined' ? '#dc2626' : 'white'}; color: ${currentAdvStatus === 'Declined' ? 'white' : '#dc2626'}; border: 1px solid #dc2626; padding: 8px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
                                <span class="material-icons-round" style="font-size: 16px;">cancel</span> Decline
                            </button>
                        </div>
                        <div id="adviser-remarks-container-${group.id}-${label}" style="display: ${currentAdvStatus === 'Declined' ? 'block' : 'none'};">
                            <div style="font-size: 11px; color: #64748b; font-weight: 600; margin-bottom: 4px;">REVISION REMARKS:</div>
                            <textarea id="adviser-remarks-${group.id}-${label}" placeholder="Reason for declining..." 
                                style="width: 100%; padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 12px; min-height: 50px; resize: vertical; margin-bottom: 6px;">${currentAdvRemarks}</textarea>
                            <button onclick="saveAdviserRemarks(${group.id}, '${label}')" 
                                style="width: 100%; background: #0ea5e9; color: white; border: none; padding: 8px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
                                <span class="material-icons-round" style="font-size: 16px;">save</span> Save
                            </button>
                        </div>
                    </div>
                `;
            } else {
                interactiveControls = '';
            }

            // Other Panel Feedback
            let panelsToDisplay = [];
            if (currentRole === 'Adviser') {
                panelsToDisplay = [];
            } else {
                if (canGrade) {
                    panelsToDisplay = Object.keys(fileStatuses).filter(p => p !== userName);
                } else {
                    panelsToDisplay = Object.keys(fileStatuses);
                }
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

        if (currentRole === 'Adviser') {
            const btnWrap = document.createElement('div');
            btnWrap.style.marginTop = '15px';
            btnWrap.id = `master-send-wrap-${categoryKey}-${selectedDefense.id}`;
            btnWrap.style.display = 'none'; // Hidden by default, shown if all approved

            btnWrap.innerHTML = `
                <button onclick="masterSendToPanel('${selectedDefense.id}', '${categoryKey}')" 
                    style="width: 100%; background: #6366f1; color: white; border: none; padding: 12px; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(99,102,241,0.3);">
                    <span class="material-icons-round" style="font-size: 18px; vertical-align: middle; margin-right: 5px;">send</span>
                    Send All to Panel
                </button>
            `;
            section.appendChild(btnWrap);

            // Initial check to show the master button
            setTimeout(() => checkMasterSendBtn(selectedDefense.id, categoryKey), 100);
        }

        fileList.appendChild(section);
    };

    if (defKey === 'titledefense') {
        createSection('Title Defense', selectedDefense.files, 'article', 'titles');
    } else if (defKey === 'preoraldefense') {
        createSection('Pre-Oral Defense', selectedDefense.files, 'description', 'pre_oral');
    } else if (defKey === 'finaldefense') {
        createSection('Final Defense', selectedDefense.files, 'menu_book', 'final');
    }

    // Reset Mobile View State
    const content = document.getElementById('fileModalContent');
    if (content) {
        content.classList.remove('view-mode-file');
        content.classList.add('view-mode-list');
    }

    document.getElementById('fileModal').style.display = 'flex';
};

// Mobile: Back to List
window.closeFileViewer = () => {
    const content = document.getElementById('fileModalContent');
    if (content) {
        content.classList.remove('view-mode-file');
        content.classList.add('view-mode-list');
    }

    // Pause/Reset PDF if needed
    const frame = document.getElementById('pdfFrame');
    if (frame) frame.src = '';
};

window.closeFileModal = () => {
    document.getElementById('fileModal').style.display = 'none';
    const frame = document.getElementById('pdfFrame');
    if (frame) frame.src = '';
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
            const viewerUrl = `${viewerPath}?file=${encodeURIComponent(currentBlobUrl)}#zoom=page-fit`;

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

    // Capture current viewer states locally to prevent race conditions when modal closes/switches
    const targetGroupId = currentViewerGroupId;
    const targetFileKey = currentViewerFileKey;
    const targetTab = currentTab;

    if (!targetGroupId || !targetFileKey) return;

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
        const fileName = `annotated_${targetGroupId}_${targetFileKey}_${cleanName}.pdf`;

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
            .from('capstone_annotations')
            .upsert({
                group_id: targetGroupId,
                defense_type: normalizeType(targetTab),
                file_key: targetFileKey,
                user_name: userName,
                annotated_file_url: publicUrl,
                updated_at: new Date().toISOString()
            }, { onConflict: 'group_id, defense_type, file_key, user_name' });

        if (dbError) throw dbError;

        if (allData && targetGroupId) {
            const normTab = normalizeType(targetTab);
            const groupEntry = allData.find(g => String(g.id) === String(targetGroupId) && g.normalizedType === normTab);

            if (groupEntry) {
                let annotKey = "";
                if (normTab.includes('title')) annotKey = "titleAnnotations";
                else if (normTab.includes('preoral')) annotKey = "preOralAnnotations";
                else if (normTab.includes('final')) annotKey = "finalAnnotations";

                if (annotKey) {
                    if (!groupEntry[annotKey]) groupEntry[annotKey] = {};
                    if (!groupEntry[annotKey][targetFileKey]) groupEntry[annotKey][targetFileKey] = {};
                    groupEntry[annotKey][targetFileKey][userName] = publicUrl;
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

let currentSectionFilter = 'ALL';

window.filterTable = (program) => {
    const btns = document.querySelectorAll('.filter-btn:not(.status-btn)');

    // If clicking the currently active program, turn it off (reset to ALL)
    if (currentProgram === program) {
        currentProgram = 'ALL';
        currentSectionFilter = 'ALL';
        btns.forEach(btn => btn.classList.remove('active'));
        currentPage = 1;
        renderTable();
        return;
    }

    // Get unique sections for the selected program
    const matchingGroups = allData.filter(g => g.program === program);
    const sections = new Set();
    matchingGroups.forEach(g => {
        let secName = '';
        if (g.yearLevel && g.section) {
            secName = `${g.yearLevel}${g.section}`;
        } else if (g.section) {
            secName = g.section;
        }
        if (secName) sections.add(secName);
    });

    const sectionArr = Array.from(sections).sort();
    let optionsHtml = `<option value="ALL">All Sections</option>`;
    sectionArr.forEach(sec => {
        optionsHtml += `<option value="${sec}">${sec}</option>`;
    });

    Swal.fire({
        title: `Filter ${program}`,
        html: `
            <div style="text-align: left; margin-top: 15px;">
                <label style="font-weight: 600; color: #475569; font-size: 14px; display: block; margin-bottom: 8px;">Select Section:</label>
                <select id="sectionFilterSelect" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #cbd5e1; outline: none; font-size: 15px; font-family: 'Outfit';">
                    ${optionsHtml}
                </select>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Apply Filter',
        confirmButtonColor: 'var(--primary-color)',
        cancelButtonText: 'Cancel'
    }).then((result) => {
        if (result.isConfirmed) {
            const chosenSection = document.getElementById('sectionFilterSelect').value;
            currentProgram = program;
            currentSectionFilter = chosenSection;

            btns.forEach(btn => btn.classList.toggle('active', btn.innerText === program));
            currentPage = 1;
            renderTable();
        }
    });
};

document.getElementById('searchInput')?.addEventListener('input', (e) => {
    searchTerm = e.target.value.trim();
    currentPage = 1;
    renderTable();
});

window.updateAdviserStatus = async (groupId, fileKey, newStatus) => {
    try {
        // Show remarks box immediately if declining
        const remarksBox = document.getElementById(`adviser-remarks-container-${groupId}-${fileKey}`);
        if (newStatus === 'Declined' && remarksBox) {
            remarksBox.style.display = 'block';
        } else if (newStatus === 'Approved' && remarksBox) {
            remarksBox.style.display = 'none';
        }

        const group = allData.find(g => g.id == groupId);
        if (!group) return;

        // Use more specific selector by finding the button within the modal
        const modalContent = document.getElementById('fileModalContent');
        const btnApprove = modalContent?.querySelector(`button[onclick="updateAdviserStatus(${groupId}, '${fileKey}', 'Approved')"]`);
        const btnDecline = modalContent?.querySelector(`button[onclick="updateAdviserStatus(${groupId}, '${fileKey}', 'Declined')"]`);

        if (btnApprove) {
            btnApprove.disabled = true;
            if (newStatus === 'Approved') {
                btnApprove.style.background = '#059669';
                btnApprove.style.color = 'white';
            } else {
                btnApprove.style.background = 'white';
                btnApprove.style.color = '#059669';
            }
        }
        if (btnDecline) {
            btnDecline.disabled = true;
            if (newStatus === 'Declined') {
                btnDecline.style.background = '#dc2626';
                btnDecline.style.color = 'white';
            } else {
                btnDecline.style.background = 'white';
                btnDecline.style.color = '#dc2626';
            }
        }

        const currentStatus = group.adviser_status || {};
        const currentRemarks = group.adviser_remarks || {};

        const remarksValue = document.getElementById(`adviser-remarks-${groupId}-${fileKey}`)?.value.trim() || '';

        currentStatus[fileKey] = newStatus;
        currentRemarks[fileKey] = remarksValue;

        // Auto Send replaced by Master Button logic
        const checkStageApproved = (keys) => keys.every(k => currentStatus[k] === 'Approved');

        let cKey = '';
        if (['title1', 'title2', 'title3'].includes(fileKey)) cKey = 'titles';
        else if (['ch1', 'ch2', 'ch3'].includes(fileKey)) cKey = 'pre_oral';
        else if (['ch4', 'ch5'].includes(fileKey)) cKey = 'final';

        const { error } = await supabaseClient
            .from('student_groups')
            .update({
                adviser_status: currentStatus,
                adviser_remarks: currentRemarks
            })
            .eq('id', groupId);

        if (error) throw error;

        // Update local state
        group.adviser_status = currentStatus;
        group.adviser_remarks = currentRemarks;

        if (typeof window.showToast === 'function') {
            const toastType = newStatus === 'Approved' ? 'success' : 'error';
            window.showToast(`Status updated to ${newStatus}.`, toastType);
        }

        // Refresh UI
        renderTable();
        if (cKey) checkMasterSendBtn(groupId, cKey);

    } catch (err) {
        console.error('Error updating adviser status:', err);
        alert('Failed to update status: ' + err.message);
    }
};

window.saveAdviserRemarks = async (groupId, fileKey) => {
    const textarea = document.getElementById(`adviser-remarks-${groupId}-${fileKey}`);
    const btn = textarea ? textarea.nextElementSibling : null;

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round" style="font-size: 16px;">hourglass_empty</span> Saving...';
    }

    try {
        const group = allData.find(g => g.id == groupId);
        if (!group) throw new Error("Group not found");

        const remarksValue = textarea?.value.trim() || '';

        const currentRemarks = group.adviser_remarks || {};
        currentRemarks[fileKey] = remarksValue;

        const { error } = await supabaseClient
            .from('student_groups')
            .update({ adviser_remarks: currentRemarks })
            .eq('id', groupId);

        if (error) throw error;
        group.adviser_remarks = currentRemarks;

        if (typeof window.showToast === 'function') {
            window.showToast('Remarks saved successfully.', 'success');
        } else {
            alert('Remarks saved successfully.');
        }

        if (btn) {
            btn.innerHTML = '<span class="material-icons-round" style="font-size: 16px;">check</span> Saved';
            // Keep disabled as requested
            btn.style.background = '#10b981'; // Green to indicate success
        }

    } catch (err) {
        console.error('Error saving remarks:', err);
        if (typeof window.showToast === 'function') {
            window.showToast('Failed to save remarks.', 'error');
        } else {
            alert('Failed to save remarks.');
        }
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span class="material-icons-round" style="font-size: 16px;">save</span> Save';
        }
    }
};

window.checkMasterSendBtn = (groupId, cKey) => {
    const group = allData.find(g => g.id == groupId);
    if (!group) return;

    const btnWrap = document.getElementById(`master-send-wrap-${cKey}-${groupId}`);
    if (!btnWrap) return;

    const statuses = group.adviser_status || {};
    let isStageApproved = false;

    if (cKey === 'titles') isStageApproved = ['title1', 'title2', 'title3'].every(k => statuses[k] === 'Approved');
    else if (cKey === 'pre_oral') isStageApproved = ['ch1', 'ch2', 'ch3'].every(k => statuses[k] === 'Approved');
    else if (cKey === 'final') isStageApproved = ['ch4', 'ch5'].every(k => statuses[k] === 'Approved');

    if (isStageApproved) {
        btnWrap.style.display = 'block';
        const btn = btnWrap.querySelector('button');
        if (statuses['SEND_TO_PANEL_' + cKey.toUpperCase()]) {
            btn.disabled = true;
            btn.innerHTML = '<span class="material-icons-round" style="font-size: 18px; vertical-align: middle; margin-right: 5px;">check_circle</span> Sent to Panel';
            btn.style.background = '#10b981';
            btn.style.cursor = 'default';
        } else {
            btn.disabled = false;
            btn.innerHTML = '<span class="material-icons-round" style="font-size: 18px; vertical-align: middle; margin-right: 5px;">send</span> Send All to Panel';
            btn.style.background = '#6366f1';
            btn.style.cursor = 'pointer';
        }
    } else {
        btnWrap.style.display = 'none';
    }
};

window.masterSendToPanel = async (groupId, cKey) => {
    try {
        const group = allData.find(g => g.id == groupId);
        if (!group) return;

        const btnWrap = document.getElementById(`master-send-wrap-${cKey}-${groupId}`);
        if (btnWrap) {
            const btn = btnWrap.querySelector('button');
            btn.disabled = true;
            btn.innerHTML = '<span class="material-icons-round spin" style="font-size: 18px; vertical-align: middle; margin-right: 5px;">sync</span> Sending...';
        }

        const currentStatus = group.adviser_status || {};
        currentStatus['SEND_TO_PANEL_' + cKey.toUpperCase()] = true; // explicitly trigger panel view

        const { error } = await supabaseClient
            .from('student_groups')
            .update({ adviser_status: currentStatus })
            .eq('id', groupId);

        if (error) throw error;
        group.adviser_status = currentStatus;

        if (typeof window.showToast === 'function') {
            window.showToast('Group sent to panel successfully!', 'success');
        } else alert('Group sent to panel successfully!');

        checkMasterSendBtn(groupId, cKey);
        renderTable(); // Update underlying table display if roles apply

    } catch (err) {
        console.error('Error sending to panel:', err);
        alert('Failed to send to panel: ' + err.message);
        checkMasterSendBtn(groupId, cKey);
    }
};

function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../';
}
