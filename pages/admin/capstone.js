// Variables may be already defined in shared.js
var PROJECT_URL = PROJECT_URL || 'https://oddzwiddvniejcawzpwi.supabase.co';
var PUBLIC_KEY = PUBLIC_KEY || 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
var supabaseClient = supabaseClient || window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

// Data storage
let allGroups = [];
let allDefenseStatuses = [];
let allStudents = [];
let allCapstoneFeedback = [];
let allSchedules = [];
let allSystemEvaluations = [];
let allIndividualEvaluations = [];
let feedbackIndex = {};
let legacyStatusIndex = {};
let filteredGroups = [];
let currentProgramFilter = 'ALL';
let adminName = '';
let displayRows = [];

// PDF Viewer State
let currentAdobeView = null;
let currentViewerFileKey = null;

// ADOBE CLIENT ID is now centrally managed in shared.js

document.addEventListener('DOMContentLoaded', () => {
    // Check Login
    const loginUser = JSON.parse(localStorage.getItem('loginUser'));
    if (!loginUser || loginUser.role !== 'Admin') {
        window.location.href = '../../';
        return;
    }
    adminName = loginUser.full_name || '';

    fetchCapstoneData();
});

async function fetchCapstoneData() {
    try {
        const [gRes, sRes, stdRes, fRes, schedRes, sysRes, indRes] = await Promise.all([
            supabaseClient.from('student_groups').select('*'),
            supabaseClient.from('defense_statuses').select('*'),
            supabaseClient.from('students').select('*'),
            supabaseClient.from('capstone_feedback').select('*'),
            supabaseClient.from('schedules').select('*'),
            supabaseClient.from('system_evaluations').select('*'),
            supabaseClient.from('individual_evaluations').select('*')
        ]);

        if (gRes.error) throw gRes.error;
        allGroups = gRes.data || [];
        console.log(`Fetched ${allGroups.length} groups for Capstone view.`);

        if (sRes.error) console.error('Error fetching defense statuses:', sRes.error);
        allDefenseStatuses = sRes.data || [];

        if (stdRes.error) console.error('Error fetching students:', stdRes.error);
        allStudents = stdRes.data || [];

        if (fRes.error) console.error('Error fetching feedback:', fRes.error);
        allCapstoneFeedback = fRes.data || [];

        if (schedRes.error) console.error('Error fetching schedules:', schedRes.error);
        allSchedules = schedRes.data || [];

        if (sysRes.error) console.error('Error fetching system evaluations:', sysRes.error);
        allSystemEvaluations = sysRes.data || [];

        if (indRes.error) console.error('Error fetching individual evaluations:', indRes.error);
        allIndividualEvaluations = indRes.data || [];

        // Build Index for fast lookup
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

        updateUI();
    } catch (err) {
        console.error('Error fetching data:', err);
    }
}

function updateUI() {
    applyFilters();
}

window.filterTable = (program) => {
    const filterBtns = document.querySelectorAll('.filter-btn');
    if (currentProgramFilter === program) {
        currentProgramFilter = 'ALL';
        filterBtns.forEach(btn => btn.classList.remove('active'));
    } else {
        currentProgramFilter = program;
        filterBtns.forEach(btn => {
            btn.classList.toggle('active', btn.innerText === program);
        });
    }
    applyFilters();
};

function applyFilters() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    displayRows = [];

    allGroups.forEach(g => {
        const tMap = resolveStatusMap(g.id, 'Title Defense');
        const pMap = resolveStatusMap(g.id, 'Pre-Oral Defense');
        const fMap = resolveStatusMap(g.id, 'Final Defense');

        // Check if ANY title is approved or completed
        const approvedKey = Object.keys(tMap).find(k =>
            (tMap[k] || '').includes('Approved') || (tMap[k] || '').includes('Completed')
        );

        if (!approvedKey) return; // Skip if not approved

        const projectTitle = getTitleText(g.project_title, approvedKey);

        if (!projectTitle || projectTitle.toLowerCase() === 'null') return; // Skip if null title

        // Filtering
        const matchesProgram = currentProgramFilter === 'ALL' || (g.program && g.program.toUpperCase() === currentProgramFilter);
        const matchesSearch = !searchTerm ||
            (g.group_name && g.group_name.toLowerCase().includes(searchTerm)) ||
            (projectTitle && projectTitle.toLowerCase().includes(searchTerm));

        if (!matchesProgram || !matchesSearch) return;

        console.log(`Group ${g.group_name}: Found approved title with key ${approvedKey}`);

        // Members
        const membersList = allStudents.filter(s => s.group_id == g.id).map(s => s.full_name);
        const membersHtml = membersList.map(m => `<span class="chip">${m}</span>`).join('');

        // Status Logic (Identical to Dashboard)
        let statusBadge = '<span class="status-badge approved">Title Approved</span>';
        if (Object.values(fMap).some(v => v === 'Completed')) {
            statusBadge = '<span class="status-badge approved">Completed</span>';
        } else if (Object.values(fMap).some(v => v.includes('Approved') || v.includes('Revisions'))) {
            statusBadge = '<span class="status-badge approved" style="background:#dcfce7; color:#166534;">Final Ongoing</span>';
        } else if (Object.values(pMap).some(v => v.includes('Approved') || v.includes('Revisions'))) {
            statusBadge = '<span class="status-badge approved" style="background:#e0f2fe; color:#0369a1;">Pre-Oral Passed</span>';
        }

        displayRows.push({
            id: g.id,
            title: projectTitle,
            group_name: g.group_name,
            membersHtml: membersHtml,
            program: g.program || '-',
            year: g.year_level || '-',
            statusHtml: statusBadge
        });
    });

    renderTable();
}

function renderTable() {
    const tableBody = document.getElementById('tableBody');
    const emptyState = document.getElementById('emptyState');
    tableBody.innerHTML = '';

    if (displayRows.length === 0) {
        emptyState.style.display = 'flex';
        return;
    }
    emptyState.style.display = 'none';

    displayRows.forEach(row => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.onclick = () => openFileModal(row.id);

        const prog = (row.program || '').toUpperCase();
        let progClass = 'prog-unknown';
        if (prog.includes('BSIS')) progClass = 'prog-bsis';
        else if (prog.includes('BSIT')) progClass = 'prog-bsit';
        else if (prog.includes('BSCS')) progClass = 'prog-bscs';

        tr.innerHTML = `
            <td style="font-weight:600; color:var(--primary-dark);">${row.title}</td>
            <td>${row.group_name}</td>
            <td><div class="chips-container">${row.membersHtml}</div></td>
            <td><span class="prog-badge ${progClass}">${prog}</span></td>
            <td>${row.year}</td>
            <td>${row.statusHtml}</td>
        `;
        tableBody.appendChild(tr);
    });
}


// Helper: Get Title
function getTitleText(pTitle, keyHint) {
    if (!pTitle) return 'Untitled Project';
    let parsed = pTitle;
    if (typeof parsed === 'string') {
        try {
            if (parsed.trim().startsWith('{')) parsed = JSON.parse(parsed);
            else return parsed;
        } catch (e) { return parsed; }
    }
    if (keyHint && parsed[keyHint] && parsed[keyHint].toLowerCase() !== 'null') return parsed[keyHint];
    const fallback = parsed.title1 || parsed.title2 || parsed.title3 || Object.values(parsed)[0] || 'Untitled Project';
    return (fallback && fallback.toLowerCase() !== 'null') ? fallback : 'Untitled Project';
}

// Helper: Resolve Status Map
function resolveStatusMap(groupId, defenseType) {
    const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const reqNorm = normalize(defenseType);
    let coreKey = '';
    if (reqNorm.includes('title')) coreKey = 'title';
    else if (reqNorm.includes('preoral')) coreKey = 'preoral';
    else if (reqNorm.includes('final')) coreKey = 'final';

    const feedbacks = (feedbackIndex[groupId] || []).filter(cf => normalize(cf.defense_type).includes(coreKey));
    const legRow = (legacyStatusIndex[groupId] || []).find(ds => normalize(ds.defense_type).includes(coreKey));

    let legacyStatuses = {};
    if (legRow && legRow.statuses) {
        try { legacyStatuses = typeof legRow.statuses === 'string' ? JSON.parse(legRow.statuses) : legRow.statuses; } catch (e) { }
    }

    const filePanelMap = {};
    Object.keys(legacyStatuses).forEach(fk => {
        if (!filePanelMap[fk]) filePanelMap[fk] = {};
        const val = legacyStatuses[fk];
        if (typeof val === 'object' && val !== null) Object.assign(filePanelMap[fk], val);
        else filePanelMap[fk]['Legacy'] = val;
    });

    feedbacks.forEach(fb => {
        if (!filePanelMap[fb.file_key]) filePanelMap[fb.file_key] = {};
        filePanelMap[fb.file_key][fb.user_name || 'Panel'] = fb.status;
    });

    const resolved = {};
    Object.keys(filePanelMap).forEach(fk => {
        const votes = Object.values(filePanelMap[fk]);
        if (votes.some(v => v === 'Redefend')) resolved[fk] = 'Redefend';
        else if (votes.some(v => v === 'Rejected')) resolved[fk] = 'Rejected';
        else if (votes.some(v => {
            const nv = (v || '').toLowerCase();
            return nv.includes('revision');
        })) resolved[fk] = 'Approved with Revisions';
        else if (votes.some(v => {
            const nv = (v || '').toLowerCase();
            return nv.includes('approved') || nv === 'completed';
        })) resolved[fk] = 'Approved';
        else resolved[fk] = 'Pending';
    });
    return resolved;
}

// File Viewer Modal
window.openFileModal = (groupId) => {
    const group = allGroups.find(g => g.id === groupId);
    if (!group) return;

    document.getElementById('modalGroupName').innerText = group.group_name;
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '';

    document.getElementById('adobe-dc-view').style.display = 'none';
    document.getElementById('pdfPlaceholder').style.display = 'flex';

    if (currentAdobeView) {
        document.getElementById('adobe-dc-view').innerHTML = '';
        currentAdobeView = null;
    }

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

    // Reset Mobile View State
    const content = document.getElementById('fileModalContent');
    if (content) {
        content.classList.remove('view-mode-file');
        content.classList.add('view-mode-list');
    }

    document.getElementById('fileModal').style.display = 'flex';
};

function createSection(sectionTitle, fileObj, icon, categoryKey, group) {
    const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const section = document.createElement('div');
    section.style.marginBottom = '20px';

    const header = document.createElement('h4');
    header.innerHTML = `<span class="material-icons-round" style="font-size:16px; vertical-align:middle; margin-right:4px;">${icon}</span> ${sectionTitle}`;
    header.style.cssText = 'font-size: 0.85rem; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 10px;';
    section.appendChild(header);

    // MERGE FEEDBACK (Legacy + New)
    const norm = categoryKey.toLowerCase().replace(/[^a-z0-9]/g, '');
    let typeFilter = '';
    if (norm.includes('title')) typeFilter = 'title';
    else if (norm.includes('preoral')) typeFilter = 'preoral';
    else if (norm.includes('final')) typeFilter = 'final';

    const mergedStatuses = {};
    const mergedRemarks = {};

    // 1. From Legacy (defense_statuses table)
    const legRow = allDefenseStatuses.find(ds => ds.group_id === group.id && normalize(ds.defense_type).includes(typeFilter));
    if (legRow) {
        let legStatuses = {};
        let legRemarks = {};
        try { legStatuses = typeof legRow.statuses === 'string' ? JSON.parse(legRow.statuses) : legRow.statuses || {}; } catch (e) { }
        try { legRemarks = typeof legRow.remarks === 'string' ? JSON.parse(legRow.remarks) : legRow.remarks || {}; } catch (e) { }

        Object.entries(legStatuses).forEach(([fKey, val]) => {
            if (!mergedStatuses[fKey]) mergedStatuses[fKey] = {};
            if (typeof val === 'object' && val !== null) Object.assign(mergedStatuses[fKey], val);
            else mergedStatuses[fKey]['Legacy'] = val;
        });
        Object.entries(legRemarks).forEach(([fKey, val]) => {
            if (!mergedRemarks[fKey]) mergedRemarks[fKey] = {};
            if (typeof val === 'object' && val !== null) Object.assign(mergedRemarks[fKey], val);
            else mergedRemarks[fKey]['Legacy'] = val;
        });
    }

    // 2. From New (capstone_feedback table)
    const feedbacks = (allCapstoneFeedback || []).filter(fb => fb.group_id == group.id && normalize(fb.defense_type).includes(typeFilter));
    feedbacks.forEach(fb => {
        if (!mergedStatuses[fb.file_key]) mergedStatuses[fb.file_key] = {};
        if (!mergedRemarks[fb.file_key]) mergedRemarks[fb.file_key] = {};

        const pName = fb.user_name || 'Panel';
        mergedStatuses[fb.file_key][pName] = fb.status;
        mergedRemarks[fb.file_key][pName] = fb.remarks;
    });

    Object.entries(fileObj).forEach(([label, url]) => {
        const isRevised = label.endsWith('_revised');
        const cleanUrl = url ? url.toString().trim() : "";

        // REMOVE NULLS and Empty URLs
        if (!cleanUrl || cleanUrl.toLowerCase() === "null" || isRevised) return;

        // FILTER: Only show approved/completed/revision titles in Capstone Records
        const votes = Object.values(mergedStatuses[label] || {});
        const hasRejected = votes.some(v => v === 'Rejected' || v === 'Redefend');
        const hasApproved = votes.some(v => {
            const nv = (v || '').toLowerCase();
            return nv.includes('approved') || nv.includes('revision') || nv === 'completed';
        });

        // If it was rejected or hasn't been approved yet, hide it from Capstone portal view
        if (hasRejected || !hasApproved) return;

        let displayLabel = label.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());

        // GET REAL TITLES FOR SIDEBAR LABELS
        if (categoryKey === 'titles' && group.project_title) {
            try {
                const projectTitles = typeof group.project_title === 'string' && group.project_title.startsWith('{')
                    ? JSON.parse(group.project_title)
                    : { title1: group.project_title };
                if (projectTitles[label] && projectTitles[label].toLowerCase() !== "null") {
                    displayLabel = projectTitles[label];
                } else if (projectTitles[label] && projectTitles[label].toLowerCase() === "null") {
                    return; // Skip if title text itself is "null" (case-insensitive)
                }
            } catch (e) { }
        }

        const itemContainer = document.createElement('div');
        itemContainer.style.cssText = 'background: white; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; overflow: hidden;';

        const item = document.createElement('div');
        item.className = 'file-item';
        item.style.cssText = 'padding: 10px 12px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; transition: all 0.2s;';

        // Resolve overall status for the file item badge
        let badgeColor = '#059669'; // Default Approved
        let finalStatus = 'Approved';
        if (votes.some(v => (v || '').toLowerCase().includes('revision'))) {
            badgeColor = '#d97706';
            finalStatus = 'Approved with Revisions';
        } else if (votes.some(v => (v || '').toLowerCase() === 'completed')) {
            finalStatus = 'Completed';
        }

        item.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:2px;">
                <span style="font-size: 0.9rem; font-weight: 500; color: #334155;">${displayLabel}</span>
                <span style="font-size: 0.7rem; font-weight: 700; color: ${badgeColor}; text-transform: uppercase;">${finalStatus}</span>
            </div>
            <span class="material-icons-round" style="font-size: 18px; color: var(--primary-color);">arrow_forward_ios</span>
        `;
        item.onclick = () => {
            document.querySelectorAll('.file-item').forEach(el => el.style.background = 'white');
            item.style.background = '#f0f9ff';

            // Mobile View Switch
            const content = document.getElementById('fileModalContent');
            if (content) {
                content.classList.remove('view-mode-list');
                content.classList.add('view-mode-file');
            }

            loadPDF(url, displayLabel, label);
        };
        itemContainer.appendChild(item);

        // Revised Version Check
        if (fileObj[label + '_revised']) {
            const revisedUrl = fileObj[label + '_revised'];
            const revItem = document.createElement('div');
            revItem.className = 'file-item';
            revItem.style.cssText = 'padding: 8px 12px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; background: #fffbeb; border-top: 1px dashed #fcd34d;';
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

                loadPDF(revisedUrl, `Revised - ${displayLabel}`, label + '_revised');
            };
            itemContainer.appendChild(revItem);
        }

        section.appendChild(itemContainer);
    });

    // SCORING SUMMARY REMOVED AS REQUESTED
    document.getElementById('fileList').appendChild(section);
}

window.closeFileModal = () => {
    document.getElementById('fileModal').style.display = 'none';
};

// Mobile: Back to List
window.closeFileViewer = () => {
    const content = document.getElementById('fileModalContent');
    if (content) {
        content.classList.remove('view-mode-file');
        content.classList.add('view-mode-list');
    }
};

window.loadPDF = (url, title, fileKey) => {
    currentViewerFileKey = fileKey;
    document.getElementById('pdfPlaceholder').style.display = 'none';
    const viewerDiv = document.getElementById('adobe-dc-view');
    viewerDiv.style.display = 'block';
    viewerDiv.innerHTML = '';

    const isLocal = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';

    if (window.AdobeDC && !isLocal) {
        currentAdobeView = new AdobeDC.View({
            clientId: window.getAdobeClientId ? window.getAdobeClientId() : ADOBE_CLIENT_ID,
            divId: "adobe-dc-view"
        });
        currentAdobeView.previewFile({
            content: { location: { url: url } },
            metaData: { fileName: title }
        }, {
            embedMode: "FULL_WINDOW",
            defaultViewMode: "FIT_PAGE",
            showAnnotationTools: false,
            showLeftHandPanel: true,
            showDownloadPDF: true,
            showPrintPDF: true
        });
    } else {
        // Fallback for local dev or missing SDK
        viewerDiv.innerHTML = `<iframe src="${url}" style="width:100%; height:100%; border:none;"></iframe>`;
    }
};

const adobeScript = document.createElement('script');
adobeScript.src = "https://documentservices.adobe.com/view-sdk/viewer.js";
document.head.appendChild(adobeScript);

window.logout = () => {
    localStorage.removeItem('loginUser');
    window.location.href = '../../';
};

document.getElementById('searchInput')?.addEventListener('input', applyFilters);
