
// Initialize Supabase client
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

// Data storage
let allGroups = [];
let allDefenseStatuses = [];
let allStudents = [];
let allCapstoneFeedback = [];
let feedbackIndex = {}; // Optimization: Map<GroupId, Array>
let legacyStatusIndex = {}; // Optimization: Map<GroupId, Array>
let filteredGroups = [];
let currentCategory = 'ALL'; // 'ALL', 'APPROVED', 'REJECTED', 'COMPLETED'
let instructorName = '';
let displayRows = [];

// PDF Viewer State
let currentAdobeView = null;
let currentViewerFileKey = null;

document.addEventListener('DOMContentLoaded', () => {
    // Check Login
    const loginUser = JSON.parse(localStorage.getItem('loginUser'));
    if (!loginUser || (loginUser.role !== 'Instructor' && loginUser.role !== 'Instructor/Adviser')) {
        window.location.href = '../../';
        return;
    }
    instructorName = loginUser.full_name || '';

    fetchDashboardData();
});

async function fetchDashboardData() {
    try {
        const [gRes, sRes, stdRes, fRes] = await Promise.all([
            supabaseClient.from('student_groups').select('*'),
            supabaseClient.from('defense_statuses').select('*'),
            supabaseClient.from('students').select('*'),
            supabaseClient.from('capstone_feedback').select('*')
        ]);

        if (gRes.error) throw gRes.error;
        allGroups = gRes.data || [];

        if (sRes.error) console.error('Error fetching statuses:', sRes.error);
        allDefenseStatuses = sRes.data || [];

        if (stdRes.error) console.error('Error fetching students:', stdRes.error);
        allStudents = stdRes.data || [];

        if (fRes.error) console.error('Error fetching feedback:', fRes.error);
        allCapstoneFeedback = fRes.data || [];

        // BUILD INDICES for Fast Lookup (O(1))
        feedbackIndex = {};
        allCapstoneFeedback.forEach(cf => {
            if (!feedbackIndex[cf.group_id]) feedbackIndex[cf.group_id] = [];
            feedbackIndex[cf.group_id].push(cf);
        });

        legacyStatusIndex = {};
        allDefenseStatuses.forEach(ds => {
            if (!legacyStatusIndex[ds.group_id]) legacyStatusIndex[ds.group_id] = [];
            legacyStatusIndex[ds.group_id].push(ds);
        });

        // Populate Section Filter
        populateSectionFilter();

        // Initial Count Update
        applyDashboardFilters();

    } catch (err) {
        console.error('Error fetching dashboard data:', err);
    }
}

function populateSectionFilter() {
    const sectionFilter = document.getElementById('sectionFilter');

    // Filter groups where I am the adviser (REMOVED - Global View)
    // const myGroups = allGroups.filter(g => ...);

    const sections = [...new Set(allGroups.map(g => g.section).filter(Boolean))].sort();

    sections.forEach(sec => {
        const option = document.createElement('option');
        option.value = sec;
        option.textContent = sec;
        sectionFilter.appendChild(option);
    });
}

window.setCategoryFilter = (category) => {
    if (currentCategory === category) {
        currentCategory = 'ALL';
    } else {
        currentCategory = category;
    }

    // Visual feedback
    document.querySelectorAll('.chart-card').forEach(card => {
        card.style.border = '1px solid #f0f0f0';
        card.style.transform = 'none';
        card.style.boxShadow = '0 2px 10px rgba(0,0,0,0.05)';
    });

    if (currentCategory !== 'ALL') {
        const titleMap = { 'APPROVED': 'Approved Titles', 'REJECTED': 'Rejected Titles', 'COMPLETED': 'Completed Titles' };
        document.querySelectorAll('.chart-card').forEach(card => {
            if (card.querySelector('.chart-title').innerText === titleMap[currentCategory]) {
                card.style.border = '2px solid var(--primary-color)';
                card.style.transform = 'translateY(-5px)';
                card.style.boxShadow = '0 8px 20px rgba(0,0,0,0.1)';
            }
        });
    }

    applyDashboardFilters();
};

window.applyDashboardFilters = () => {
    const program = document.getElementById('programFilter').value;
    const section = document.getElementById('sectionFilter').value;
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    // 1. Filter by Adviser, Program, Section, Search (Used for COUNTS)
    const baseGroups = allGroups.filter(g => {
        // REMOVED: Adviser check (Global dashboard view requested)
        // const dbAdviser = (g.adviser || '').toLowerCase().trim();
        // const me = instructorName.toLowerCase().trim();
        // const isMyGroup = dbAdviser.includes(me) || me.includes(dbAdviser);
        // if (!isMyGroup) return false;

        const progMatch = program === 'ALL' || (g.program && g.program.toUpperCase() === program);
        const sectMatch = section === 'ALL' || (g.section && g.section === section);
        const searchMatch = !searchTerm ||
            (g.group_name && g.group_name.toLowerCase().includes(searchTerm)) ||
            (g.program && g.program.toLowerCase().includes(searchTerm));
        return progMatch && sectMatch && searchMatch;
    });



    displayRows = [];

    baseGroups.forEach(g => {
        const tMap = resolveStatusMap(g.id, 'Title Defense');
        const pMap = resolveStatusMap(g.id, 'Pre-Oral Defense');
        const fMap = resolveStatusMap(g.id, 'Final Defense');

        const members = allStudents
            .filter(s => s.group_id == g.id) // Loose comparison (string vs number)
            .map(s => s.full_name)
            .join(', ');

        const baseObj = {
            id: g.id,
            group_name: g.group_name || '-',
            members: members || '-',
            program: g.program || '-',
            year: g.year_level || '-',
            original: g
        };

        // Determine which title is approved
        const approvedKey = Object.keys(tMap).find(k => (tMap[k] || '').includes('Approved') || (tMap[k] || '').includes('Completed'));
        let projectTitleDisplay = g.group_name; // Default fallback

        // If we have an approved key, specifically fetch THAT title text
        if (approvedKey) {
            projectTitleDisplay = getTitleText(g.project_title, approvedKey);
        }
        // If not, try to get ANY title text (e.g. title1) instead of just group name if possible
        else {
            const firstTitleKey = Object.keys(tMap)[0] || 'title1';
            const potentialTitle = getTitleText(g.project_title, firstTitleKey);
            if (potentialTitle && potentialTitle !== 'undefined') {
                projectTitleDisplay = potentialTitle;
            }
        }

        if (currentCategory === 'ALL') {
            let statusBadge = '<span class="status-badge pending">Pending</span>';

            // Check progression from Final -> Pre-Oral -> Title
            const fStatus = Object.values(fMap).find(v => v === 'Completed' || v.includes('Approved') || v.includes('Revisions')) ||
                Object.values(fMap).find(v => v === 'Redefend') || 'Pending';

            const pStatus = Object.values(pMap).find(v => v.includes('Approved') || v.includes('Revisions')) ||
                Object.values(pMap).find(v => v === 'Redefend') || 'Pending';

            const tStatus = Object.values(tMap).find(v => v.includes('Approved') || v.includes('Revisions')) ||
                Object.values(tMap).find(v => v === 'Redefend' || v === 'Rejected') || 'Pending';

            if (Object.values(fMap).some(v => v === 'Completed')) {
                statusBadge = '<span class="status-badge approved">Completed</span>';
            } else if (Object.values(fMap).some(v => v.includes('Approved') || v.includes('Revisions'))) {
                statusBadge = '<span class="status-badge approved" style="background:#dcfce7; color:#166534;">Final Ongoing</span>';
            } else if (pStatus.includes('Approved') || pStatus.includes('Revisions')) {
                statusBadge = '<span class="status-badge approved" style="background:#e0f2fe; color:#0369a1;">Pre-Oral Passed</span>';
            } else if (tStatus.includes('Approved') || tStatus.includes('Revisions')) {
                statusBadge = '<span class="status-badge approved" style="background:#dbeafe; color:#2563eb;">Title Approved</span>';
            } else if (tStatus === 'Rejected' || tStatus === 'Redefend' || pStatus === 'Redefend' || fStatus === 'Redefend') {
                statusBadge = `<span class="status-badge rejected">${fStatus === 'Redefend' ? 'Redefend Final' : pStatus === 'Redefend' ? 'Redefend Pre-Oral' : tStatus}</span>`;
            }

            displayRows.push({ ...baseObj, title: projectTitleDisplay, statusHtml: statusBadge });

        } else if (currentCategory === 'APPROVED') {
            if (approvedKey) {
                displayRows.push({
                    ...baseObj,
                    title: `<strong>${projectTitleDisplay}</strong>`,
                    statusHtml: '<span class="status-badge approved">Title Approved</span>'
                });
            }
        } else if (currentCategory === 'REJECTED') {
            Object.keys(tMap).forEach(k => {
                if (tMap[k] === 'Rejected' || tMap[k] === 'Redefend') {
                    displayRows.push({
                        ...baseObj,
                        title: `<span style="color: #dc2626;">${getTitleText(g.project_title, k)}</span>`,
                        statusHtml: `<span class="status-badge rejected">${tMap[k]}</span>`
                    });
                }
            });
        } else if (currentCategory === 'COMPLETED') {
            if (Object.values(fMap).some(v => v === 'Completed')) {
                displayRows.push({
                    ...baseObj,
                    title: `<strong>${projectTitleDisplay}</strong>`,
                    statusHtml: '<span class="status-badge approved">Completed</span>'
                });
            }
        }
    });

    // 4. Update Counts
    updateCounts(baseGroups);

    // 5. Render
    renderTable();
};

// --- Helper Functions (Hoisted/Global) ---

function getTitleText(pTitle, keyHint) {
    if (!pTitle) return keyHint || '';
    let parsed = pTitle;
    if (typeof parsed === 'string') {
        try {
            if (parsed.trim().startsWith('{')) {
                parsed = JSON.parse(parsed);
            } else {
                return parsed;
            }
        } catch (e) { return parsed; }
    }

    if (keyHint && parsed[keyHint]) return parsed[keyHint];
    return parsed.title1 || parsed.title2 || parsed.title3 || Object.values(parsed)[0] || '';
}

function resolveStatusMap(groupId, defenseType) {
    const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    // Determine Core Key
    const reqNorm = normalize(defenseType);
    let coreKey = '';
    if (reqNorm.includes('title')) coreKey = 'title';
    else if (reqNorm.includes('preoral')) coreKey = 'preoral';
    else if (reqNorm.includes('final')) coreKey = 'final';

    // 1. Gather all individual votes from New Table (capstone_feedback)
    // Use Index for O(1) Access
    const feedbacks = (feedbackIndex[groupId] || []).filter(cf => {
        const dbNorm = normalize(cf.defense_type);
        return dbNorm.includes(coreKey);
    });

    // 2. Gather Legacy Statuses
    // Use Index for O(1) Access
    const legRow = (legacyStatusIndex[groupId] || []).find(ds => {
        const dbNorm = normalize(ds.defense_type);
        return dbNorm.includes(coreKey);
    });
    let legacyStatuses = {};
    if (legRow && legRow.statuses) {
        if (typeof legRow.statuses === 'string') {
            try { legacyStatuses = JSON.parse(legRow.statuses); } catch (e) { }
        } else {
            legacyStatuses = legRow.statuses || {};
        }
    }

    // 3. Merge into a map: { fileKey: { PanelName: Status } }
    const filePanelMap = {};

    // Process Legacy
    Object.keys(legacyStatuses).forEach(fk => {
        if (!filePanelMap[fk]) filePanelMap[fk] = {};
        const val = legacyStatuses[fk];
        if (typeof val === 'object' && val !== null) {
            Object.assign(filePanelMap[fk], val);
        } else {
            // Scalar value (Oldest format) -> Treat as consensus or single panel
            filePanelMap[fk]['Legacy'] = val;
        }
    });

    // Process New (Overrides Legacy if same key/user)
    feedbacks.forEach(fb => {
        if (!filePanelMap[fb.file_key]) filePanelMap[fb.file_key] = {};
        const pName = fb.user_name || 'Panel';
        filePanelMap[fb.file_key][pName] = fb.status;
    });

    // 4. Resolve Consensus per File Key
    const resolved = {};
    Object.keys(filePanelMap).forEach(fk => {
        const votes = Object.values(filePanelMap[fk]);
        // Priority: Redefend > Rejected > Approved with Revisions > Approved
        // Also normalize "Approve" (legacy) to "Approved"

        if (votes.some(v => v === 'Redefend')) resolved[fk] = 'Redefend';
        else if (votes.some(v => v === 'Rejected')) resolved[fk] = 'Rejected';
        else if (votes.some(v => v && v.includes('Revision'))) resolved[fk] = 'Approved with Revisions';
        else if (votes.some(v => v && (v.includes('Approved') || v.includes('Approve') || v === 'Completed'))) resolved[fk] = 'Approved';
        else resolved[fk] = 'Pending';
    });

    return resolved;
}

function deprecated_updateCounts(groups) {
    let approvedTotal = 0;
    let rejectedTotal = 0;

    groups.forEach(g => {
        const tMap = resolveStatusMap(g.id, 'Title Defense');
        const values = Object.values(tMap);

        values.forEach(v => {
            if (v && (v === 'Approved' || v === 'Approved with Revisions' || v === 'Completed')) {
                approvedTotal++;
            } else if (v === 'Rejected' || v === 'Redefend') {
                rejectedTotal++;
            }
        });
    });

    // OVERRIDE: If we are actively filtering by a category, the count should reflect visible rows
    if (currentCategory === 'APPROVED') {
        approvedTotal = displayRows.length;
    } else if (currentCategory === 'REJECTED') {
        rejectedTotal = displayRows.length;
    }

    /* 
    // Display Counts (Update Chart)
    if (window.statusChart) {
        window.statusChart.data.datasets[0].data = [approvedTotal, rejectedTotal];
        window.statusChart.update();
    }

    // Update Status Log
    const logEl = document.getElementById('statusLog');
    if (logEl) {
        const updates = [];
        groups.forEach(g => {
            const tMap = resolveStatusMap(g.id, 'Title Defense');
            const values = Object.values(tMap);

            // Determine display status
            let displayStatus = 'Pending';
            if (values.some(v => v === 'Redefend')) displayStatus = 'Redefend';
            else if (values.some(v => v === 'Rejected')) displayStatus = 'Rejected';
            else if (values.some(v => v && v.includes('Revision'))) displayStatus = 'Approved w/ Rev';
            else if (values.some(v => v && (v.includes('Approved') || v.includes('Approve') || v === 'Completed'))) displayStatus = 'Approved';

            if (displayStatus !== 'Pending') {
                updates.push({ name: g.group_name, status: displayStatus });
            }
        });

        if (updates.length > 0) {
            logEl.innerHTML = updates.map(u => {
                let color = '#64748b';
                if (u.status === 'Approved') color = '#22c55e';
                else if (u.status === 'Rejected' || u.status === 'Redefend') color = '#ef4444';
                else if (u.status.includes('Rev')) color = '#f59e0b';

                return `
                <div style="display:flex; justify-content:space-between; align-items:center; padding: 10px 0; border-bottom:1px solid #f1f5f9;">
                    <span style="font-weight:600; font-size:0.85rem; color:#334155;">${u.name}</span>
                    <span style="font-size:0.75rem; font-weight:700; padding: 4px 10px; border-radius:12px; background:${color}20; color:${color};">${u.status.toUpperCase()}</span>
                </div>`;
            }).join('');
        } else {
            logEl.innerHTML = '<div style="text-align:center; color:#94a3b8; font-size:0.9rem; margin-top: 20px;">No graded titles found.</div>';
        }
    }
}

// Global variable for chart
window.statusChart = null;
*/
}



function countDefenseStatus(allStatuses, defenseType, passValues) { return 0; }

async function renderTable() {
    const tableBody = document.getElementById('tableBody');
    const emptyState = document.getElementById('emptyState');
    tableBody.innerHTML = '';

    if (displayRows.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        return;
    }
    if (emptyState) emptyState.style.display = 'none';

    displayRows.forEach(row => {
        const program = (row.program || '').toUpperCase();
        let progClass = 'prog-unknown';
        if (program.includes('BSIS')) progClass = 'prog-bsis';
        else if (program.includes('BSIT')) progClass = 'prog-bsit';
        else if (program.includes('BSCS')) progClass = 'prog-bscs';

        const members = (row.members || '').split(',').map(m => m.trim()).filter(m => m && m !== '-');
        const membersHtml = members.length > 0
            ? members.map(m => `<span class="chip">${m}</span>`).join('')
            : '<span style="color:#94a3b8;">-</span>';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.title || '-'}</td>
            <td>${row.group_name}</td>
            <td>
                <div class="chips-container">
                    ${membersHtml}
                </div>
            </td>
            <td><span class="prog-badge ${progClass}">${program}</span></td>
            <td>${row.year}</td>
        `;
        tableBody.appendChild(tr);
    });
}

// --- FILE MODAL LOGIC (Adviser View) ---
window.openFileModal = async (groupId) => {
    const group = allGroups.find(g => g.id === groupId);
    if (!group) return;

    document.getElementById('modalGroupName').innerText = `${group.group_name} - Submissions`;
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '';

    // Reset PDF view
    document.getElementById('adobe-dc-view').style.display = 'none';
    document.getElementById('pdfPlaceholder').style.display = 'flex';
    if (currentAdobeView) {
        document.getElementById('adobe-dc-view').innerHTML = '';
        currentAdobeView = null;
    }

    // Prepare File Categories
    const categories = [
        { title: 'Title Defense', data: group.title_link, icon: 'article', key: 'titles' },
        { title: 'Pre-Oral Defense', data: group.pre_oral_link, icon: 'description', key: 'pre_oral' },
        { title: 'Final Defense', data: group.final_link, icon: 'menu_book', key: 'final' }
    ];

    categories.forEach(cat => {
        let files = {};
        if (cat.data) {
            try { files = typeof cat.data === 'string' ? JSON.parse(cat.data) : cat.data; } catch (e) { }
        }
        if (Object.keys(files).length > 0) {
            createSection(cat.title, files, cat.icon, cat.key, group);
        }
    });

    document.getElementById('fileModal').style.display = 'flex';
};

function createSection(sectionTitle, fileObj, icon, categoryKey, group) {
    const section = document.createElement('div');
    section.style.marginBottom = '20px';

    const header = document.createElement('h4');
    header.innerHTML = `<span class="material-icons-round" style="font-size:16px; vertical-align:middle; margin-right:4px;">${icon}</span> ${sectionTitle}`;
    header.style.cssText = 'font-size: 0.85rem; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 10px;';
    section.appendChild(header);

    const statusesForGroup = allDefenseStatuses.filter(ds => ds.group_id === group.id);
    const statusRow = statusesForGroup.find(s => {
        const type = (s.defense_type || '').toLowerCase();
        if (categoryKey === 'titles' && type.includes('title')) return true;
        if (categoryKey === 'pre_oral' && type.includes('pre-oral')) return true;
        if (categoryKey === 'final' && type.includes('final')) return true;
        return false;
    });

    let overallRemarks = {};
    let overallStatuses = {};
    if (statusRow) {
        try { overallRemarks = typeof statusRow.remarks === 'string' ? JSON.parse(statusRow.remarks) : statusRow.remarks || {}; } catch (e) { }
        try { overallStatuses = typeof statusRow.statuses === 'string' ? JSON.parse(statusRow.statuses) : statusRow.statuses || {}; } catch (e) { }
    }

    Object.entries(fileObj).forEach(([label, url]) => {
        const isRevised = label.endsWith('_revised');
        const cleanUrl = url ? url.toString().trim() : "";
        if (!cleanUrl || cleanUrl.toLowerCase() === "null" || isRevised) return;

        const itemContainer = document.createElement('div');
        itemContainer.style.cssText = 'background: white; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; overflow: hidden;';

        // 1. MAIN FILE ITEM
        const item = document.createElement('div');
        item.className = 'file-item';
        item.style.cssText = 'padding: 10px 12px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; transition: all 0.2s;';

        // Display Label logic
        let displayLabel = label.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        if (categoryKey === 'titles' && group.project_title) {
            try {
                const projectTitles = typeof group.project_title === 'string' && group.project_title.startsWith('{')
                    ? JSON.parse(group.project_title)
                    : { title1: group.project_title };
                if (projectTitles[label]) displayLabel = projectTitles[label];
            } catch (e) { }
        }

        item.innerHTML = `
            <span style="font-size: 0.9rem; font-weight: 500; color: #334155;">${displayLabel}</span>
            <span class="material-icons-round" style="font-size: 18px; color: var(--primary-color);">arrow_forward_ios</span>
        `;

        item.onclick = () => {
            document.querySelectorAll('.file-item').forEach(el => el.style.background = 'white');
            item.style.background = '#f0f9ff';
            loadPDF(url, displayLabel, label);
        };
        itemContainer.appendChild(item);

        // 2. REVISED VERSION (if exists)
        if (fileObj[label + '_revised']) {
            const revisedUrl = fileObj[label + '_revised'];
            const revItem = document.createElement('div');
            revItem.className = 'file-item';
            revItem.style.cssText = 'padding: 8px 12px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; background: #fffbeb; border-top: 1px dashed #fcd34d; transition: all 0.2s;';
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
                loadPDF(revisedUrl, `Revised - ${displayLabel}`, label + '_revised');
            };
            itemContainer.appendChild(revItem);
        }

        // 3. FEEDBACK AREA (Adviser Read-Only)
        const feedbackArea = document.createElement('div');
        feedbackArea.style.cssText = 'padding: 12px; background: #f8fafc; border-top: 1px solid #e2e8f0;';

        const fileStatuses = typeof overallStatuses[label] === 'object' ? overallStatuses[label] : {};
        const fileRemarks = typeof overallRemarks[label] === 'object' ? overallRemarks[label] : {};
        const panelsList = Object.keys(fileStatuses);

        let evaluationsHtml = '';
        if (panelsList.length > 0) {
            evaluationsHtml = panelsList.map(panel => {
                const status = fileStatuses[panel] || 'Pending';
                const rmk = fileRemarks[panel] || '';
                let color = '#64748b';
                if (status.includes('Approved') || status === 'Completed') color = '#059669';
                else if (status.includes('Revisions')) color = '#d97706';
                else if (status === 'Rejected' || status === 'Redefend') color = '#dc2626';

                return `
                    <div style="font-size: 11px; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px dashed #e2e8f0;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 2px;">
                            <strong style="color: var(--primary-color);">${panel}</strong>
                            <span style="font-weight:700; color:${color};">${status}</span>
                        </div>
                        <div style="color: #64748b; font-style: italic;">"${rmk || 'No specific remarks'}"</div>
                    </div>
                `;
            }).join('');
        } else {
            evaluationsHtml = '<div style="font-size:11px; color:#94a3b8; text-align:center; padding:5px;">Waiting for panel evaluations...</div>';
        }

        feedbackArea.innerHTML = `
            <div style="padding: 8px; background: #f0f9ff; border: 1px dashed #bae6fd; border-radius: 6px; color: #0369a1; font-size: 11px; font-weight: 600; text-align: center; margin-bottom: 12px;">
                <span class="material-icons-round" style="font-size: 14px; vertical-align: middle; margin-right: 4px;">visibility</span>
                ADVISER READ-ONLY VIEW
            </div>
            <div style="font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Panel Evaluations</div>
            ${evaluationsHtml}
        `;

        itemContainer.appendChild(feedbackArea);
        section.appendChild(itemContainer);
    });

    document.getElementById('fileList').appendChild(section);
}

window.closeFileModal = () => {
    document.getElementById('fileModal').style.display = 'none';
};

window.loadPDF = (url, title, fileKey) => {
    currentViewerFileKey = fileKey;
    document.getElementById('pdfPlaceholder').style.display = 'none';
    const viewerDiv = document.getElementById('adobe-dc-view');
    viewerDiv.style.display = 'block';

    // Clear previous
    viewerDiv.innerHTML = '';

    if (window.AdobeDC) {
        currentAdobeView = new AdobeDC.View({
            clientId: "c5bda2ae638944589d1469e71f4dfdee", // Updated for better localhost/public compatibility
            divId: "adobe-dc-view"
        });
        currentAdobeView.previewFile({
            content: { location: { url: url } },
            metaData: { fileName: title }
        }, {
            embedMode: "FULL_WINDOW",
            showAnnotationTools: false, // Cleaner for Adviser
            showLeftHandPanel: true,
            showDownloadPDF: true,
            showPrintPDF: true
        });
    } else {
        viewerDiv.innerHTML = `<iframe src="${url}" style="width:100%; height:100%; border:none;"></iframe>`;
    }

    // Highlight the active file in sidebar
    document.querySelectorAll('.file-item').forEach(it => it.style.boxShadow = 'none');
    // ... we don't have .file-item since I used parent/child divs, let's just leave it for now.
};

// Add Adobe SDK
const script = document.createElement('script');
script.src = "https://documentservices.adobe.com/view-sdk/viewer.js";
document.head.appendChild(script);

function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../';
}

window.filterTable = (program) => {
    document.getElementById('programFilter').value = program;
    applyDashboardFilters();
};

document.getElementById('searchInput')?.addEventListener('input', applyDashboardFilters);

function updateCounts(groups) {
    let approvedTotal = 0;
    let rejectedTotal = 0;

    groups.forEach(g => {
        const tMap = resolveStatusMap(g.id, 'Title Defense');
        const values = Object.values(tMap);

        values.forEach(v => {
            if (v && (v === 'Approved' || v === 'Approved with Revisions' || v === 'Completed')) {
                approvedTotal++;
            } else if (v === 'Rejected' || v === 'Redefend') {
                rejectedTotal++;
            }
        });
    });

    // OVERRIDE: If we are actively filtering by a category, the count should reflect visible rows
    if (currentCategory === 'APPROVED') {
        approvedTotal = displayRows.length;
    } else if (currentCategory === 'REJECTED') {
        rejectedTotal = displayRows.length;
    }

    // Display Counts to Cards
    const titleEl = document.getElementById('countTitle');
    const rejectedEl = document.getElementById('countRejected');

    if (titleEl) titleEl.innerText = approvedTotal;
    if (rejectedEl) rejectedEl.innerText = rejectedTotal;
}
