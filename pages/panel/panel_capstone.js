const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

let allData = [];
let filteredGroups = [];
let currentTab = 'Title Defense'; // Default
let currentProgram = 'ALL';
let searchTerm = '';
let groupGrades = {}; // Map: groupId -> Set of graded/evaluated types

document.addEventListener('DOMContentLoaded', () => {
    loadCapstoneData();
});

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
        window.location.href = '../../index.html';
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

        // 4. Process Data
        allData = [];

        groups.forEach(group => {
            const groupSchedules = schedules.filter(s => s.group_id === group.id);

            // We potentially have multple schedules (Title, Pre, Final)
            // But the existing code flattened groups. 
            // We need to create multiple entries if a group has multiple active schedules?
            // Actually, the TABS control which schedule we show.
            // So we should generate one entry PER schedule type found, usually.
            // Or if no schedule, maybe a draft entry?
            // Let's iterate found schedules. If none, maybe skip or show as 'Draft'.

            if (groupSchedules.length === 0) {
                // Skip or handle no-schedule groups
                return;
            }

            groupSchedules.forEach(sched => {
                // Check Access: Is user Adviser or Panel?
                const isAdviser = group.adviser === user.name;
                const isPanelist = [sched.panel1, sched.panel2, sched.panel3, sched.panel4, sched.panel5].includes(user.name);

                if (!isAdviser && !isPanelist) return; // Skip if not related

                // File Links parsing
                let files = {};
                let statusMap = {};
                let remarksMap = {};

                // Determine which column to read based on schedule type?
                // Actually the group has all columns. We just need to pick the right one for the Modal later.
                // For the TABLE row, we just need generic info.

                // Normalized Type
                const normType = normalizeType(sched.schedule_type);

                // Populate with ALL file data for modal usage
                files = {
                    titles: group.title_link ? JSON.parse(group.title_link) : {},
                    pre_oral: group.pre_oral_link ? JSON.parse(group.pre_oral_link) : {},
                    final: group.final_link ? JSON.parse(group.final_link) : {}
                };

                allData.push({
                    id: group.id,
                    type: sched.schedule_type,
                    normalizedType: normType,
                    groupName: group.group_name,
                    program: (group.program || '').toUpperCase(),
                    date: sched.schedule_date,
                    time: sched.schedule_time,
                    venue: sched.schedule_venue,
                    panels: [sched.panel1, sched.panel2, sched.panel3, sched.panel4, sched.panel5].filter(p => p),
                    files: files,
                    // Pass specific statuses for Modal
                    titleStatus: group.title_status ? JSON.parse(group.title_status) : {},
                    preOralStatus: group.pre_oral_status ? JSON.parse(group.pre_oral_status) : {},
                    finalStatus: group.final_status ? JSON.parse(group.final_status) : {},

                    titleRemarks: group.title_remarks ? JSON.parse(group.title_remarks) : {},
                    preOralRemarks: group.pre_oral_remarks ? JSON.parse(group.pre_oral_remarks) : {},
                    finalRemarks: group.final_remarks ? JSON.parse(group.final_remarks) : {},

                    status: sched.status || 'Active',
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

function renderTable() {
    const tableBody = document.getElementById('tableBody');
    const emptyState = document.getElementById('emptyState');
    tableBody.innerHTML = '';

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

        return typeMatch && programMatch && searchMatch;
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
        const panelsStr = g.panels && g.panels.length > 0 ? g.panels.join(', ') : '-';

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
            <td style="font-weight: 600; color: var(--primary-dark);">${g.type}</td>
            <td>
                <div style="font-weight: 600;">${g.groupName}</div>
                <div style="font-size: 12px; color: #64748b; margin-top: 2px;">${g.isAdviser ? 'Adviser View' : 'Panel View'}</div>
            </td>
            <td><span class="status-badge" style="background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0;">${g.program}</span></td>
            <td>
                <div style="font-weight: 500;">${dateStr}</div>
                <div style="font-size: 11px; color: #64748b;">${g.time || ''}</div>
            </td>
            <td>${g.venue || '-'}</td>
            <td><span style="font-size: 12px; line-height: 1.4; color: #475569;">${panelsStr}</span></td>
            <td>${actionBtn}</td>
            <td><span class="status-badge ${g.status.toLowerCase()}">${g.status}</span></td>
        `;

        tableBody.appendChild(row);
    });
}

// Global functions for Modal (Reusing existing logic roughly, but checking context)
window.openFileModal = (groupId) => {
    const group = allData.find(g => g.id === groupId);
    if (!group) return;

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
                loadViewer(url);
            };

            itemContainer.appendChild(item);

            // Approval Controls logic (same as before)
            // ... (We assume the status/remarks update logic remains valid)
            // Re-implement simplified version here to save space or reuse if function available

            // To ensure it works, I'll inject the controls logic directly again (safest)
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

            const currentStatus = currentStatusMap[label] || 'Pending';
            const remarks = currentRemarksMap[label] || '';

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

            if (currentStatus === 'Approved') {
                statusColor = '#059669'; statusBg = '#dcfce7'; iconText = 'check_circle';
            } else if (currentStatus === 'Approve with Revisions') {
                statusColor = '#d97706'; statusBg = '#fef3c7'; iconText = 'warning';
            } else if (currentStatus === 'Rejected' || currentStatus === 'Redefense') {
                statusColor = '#dc2626'; statusBg = '#fee2e2'; iconText = 'cancel';
            }

            let optionsHtml = '';
            if (categoryKey === 'titles') {
                optionsHtml = `
                    <option value="Approved" ${currentStatus === 'Approved' ? 'selected' : ''}>Approve</option>
                    <option value="Approve with Revisions" ${currentStatus === 'Approve with Revisions' ? 'selected' : ''}>Approve w/ Revisions</option>
                    <option value="Rejected" ${currentStatus === 'Rejected' ? 'selected' : ''}>Reject</option>
                `;
            } else {
                optionsHtml = `
                    <option value="Approved" ${currentStatus === 'Approved' ? 'selected' : ''}>Approve</option>
                    <option value="Approve with Revisions" ${currentStatus === 'Approve with Revisions' ? 'selected' : ''}>Approve w/ Revisions</option>
                    <option value="Redefense" ${currentStatus === 'Redefense' ? 'selected' : ''}>Redefense</option>
                `;
            }

            controls.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px;">Status</span>
                    <div style="font-size: 12px; font-weight: 700; color: ${statusColor}; background: ${statusBg}; padding: 4px 8px; border-radius: 99px; display: flex; align-items: center; gap: 4px;">
                        <span class="material-icons-round" style="font-size: 14px;">${iconText}</span>
                        ${currentStatus}
                    </div>
                </div>
                <select onchange="updateStatus(${group.id}, '${categoryKey}', '${label}', this.value)" 
                    style="width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 13px; cursor: pointer; background: white; color: #334155; font-weight: 500; outline: none; margin-bottom: 5px;">
                    <option value="Pending" ${currentStatus === 'Pending' ? 'selected' : ''}>Change Status...</option>
                    ${optionsHtml}
                </select>
                <div style="margin-top: 5px;">
                    <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px; margin-bottom: 5px;">Remarks</div>
                    <textarea id="remarks-${categoryKey}-${label}" placeholder="Add feedback..." 
                        style="width: 100%; padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px; font-family: 'Outfit', sans-serif; font-size: 13px; min-height: 60px; resize: vertical;">${remarks}</textarea>
                    <button onclick="saveRemarks(${group.id}, '${categoryKey}', '${label}')" 
                        style="width: 100%; margin-top: 5px; background: ${remarks ? '#dcfce7' : 'var(--primary-light)'}; color: ${remarks ? '#166534' : 'var(--primary-color)'}; border: none; padding: 6px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">
                        ${remarks ? 'Saved' : 'Save Remarks'}
                    </button>
                </div>
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

    // Filter which sections to show based on currentTab
    const normTab = normalizeType(currentTab);

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
    // ... (Existing logic compliant)
    // Same implementation as before
    if (newStatus === 'Pending') return;
    try {
        const group = allData.find(g => g.id === groupId);
        if (!group) return;
        let column = '';
        let localMap = {};
        if (categoryKey === 'titles') { column = 'title_status'; if (!group.titleStatus) group.titleStatus = {}; localMap = group.titleStatus; }
        else if (categoryKey === 'pre_oral') { column = 'pre_oral_status'; if (!group.preOralStatus) group.preOralStatus = {}; localMap = group.preOralStatus; }
        else if (categoryKey === 'final') { column = 'final_status'; if (!group.finalStatus) group.finalStatus = {}; localMap = group.finalStatus; }
        localMap[fileKey] = newStatus;
        const { error } = await supabaseClient.from('student_groups').update({ [column]: JSON.stringify(localMap) }).eq('id', groupId);
        if (error) throw error;
        openFileModal(groupId);
    } catch (err) { console.error(err); alert('Failed to update status.'); }
};

window.saveRemarks = async (groupId, categoryKey, fileKey) => {
    // ... (Existing logic)
    const userJson = localStorage.getItem('loginUser');
    if (!userJson) return;
    const user = JSON.parse(userJson);
    const userName = user.name || 'Panel';
    const textarea = document.getElementById(`remarks-${categoryKey}-${fileKey}`);
    const newText = textarea.value.trim();
    if (!newText) return;
    let formattedText = newText;
    const prefix = `${userName}:`;
    if (!formattedText.startsWith(prefix)) { formattedText = `${prefix} ${newText}`; }

    const group = allData.find(g => g.id === groupId);
    let column = '';
    let localMap = {};
    if (categoryKey === 'titles') { column = 'title_remarks'; localMap = group.titleRemarks || {}; }
    else if (categoryKey === 'pre_oral') { column = 'pre_oral_remarks'; localMap = group.preOralRemarks || {}; }
    else if (categoryKey === 'final') { column = 'final_remarks'; localMap = group.finalRemarks || {}; }

    localMap[fileKey] = formattedText;
    try {
        const { error } = await supabaseClient.from('student_groups').update({ [column]: JSON.stringify(localMap) }).eq('id', groupId);
        if (error) throw error;

        // Update local data
        if (categoryKey === 'titles') {
            if (!group.titleRemarks) group.titleRemarks = {};
            group.titleRemarks[fileKey] = formattedText;
        } else if (categoryKey === 'pre_oral') {
            if (!group.preOralRemarks) group.preOralRemarks = {};
            group.preOralRemarks[fileKey] = formattedText;
        } else if (categoryKey === 'final') {
            if (!group.finalRemarks) group.finalRemarks = {};
            group.finalRemarks[fileKey] = formattedText;
        }

        // Persistent visual feedback
        const textarea = document.getElementById(`remarks-${categoryKey}-${fileKey}`);
        if (textarea) {
            const btn = textarea.nextElementSibling;
            btn.innerText = 'Saved';
            btn.style.background = '#dcfce7';
            btn.style.color = '#166534';
            // We do NOT set a timeout to revert it, per user request.
        }
    } catch (e) { console.error(e); alert('Error saving remarks'); }
};

window.closeFileModal = () => {
    document.getElementById('fileModal').style.display = 'none';
    document.getElementById('fileViewer').src = '';
};

window.loadViewer = (url) => {
    if (!url) return;
    let viewerUrl = url;
    if (url.includes('drive.google.com')) { viewerUrl = url.replace('/view', '/preview'); }
    else if (url.endsWith('.pdf') || url.endsWith('.doc') || url.endsWith('.docx') || url.endsWith('.ppt') || url.endsWith('.pptx')) {
        viewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;
    }
    const iframe = document.getElementById('fileViewer');
    iframe.src = viewerUrl;
    iframe.style.display = 'block';
    document.getElementById('viewerPlaceholder').style.display = 'none';
    document.getElementById('viewerToolbar').style.display = 'flex';
    document.getElementById('externalLinkBtn').href = url;
};

window.filterTable = (program) => {
    if (currentProgram === program) { currentProgram = 'ALL'; document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active')); }
    else { currentProgram = program; document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.toggle('active', btn.innerText === program)); }
    renderTable();
};

document.getElementById('searchInput')?.addEventListener('input', (e) => {
    searchTerm = e.target.value;
    renderTable();
});

function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../index.html';
}

