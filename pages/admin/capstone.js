
// Initialize Supabase client
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

// Data storage
let allGroups = [];
let allDefenseStatuses = [];
let allStudents = [];
let allCapstoneFeedback = [];
let feedbackIndex = {};
let legacyStatusIndex = {};
let filteredGroups = [];
let currentProgramFilter = 'ALL';
let adminName = '';
let displayRows = [];

// PDF Viewer State
let currentAdobeView = null;
let currentViewerFileKey = null;

// ADOBE CLIENT ID - Verified for Vercel Domain
const ADOBE_CLIENT_ID = "5edc19dfde9349e3acb7ecc73bfa4848";

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
        const [gRes, sRes, stdRes, fRes] = await Promise.all([
            supabaseClient.from('student_groups').select('*'),
            supabaseClient.from('defense_statuses').select('*'),
            supabaseClient.from('students').select('*'),
            supabaseClient.from('capstone_feedback').select('*')
        ]);

        if (gRes.error) throw gRes.error;
        allGroups = gRes.data || [];
        allDefenseStatuses = sRes.data || [];
        allStudents = stdRes.data || [];
        allCapstoneFeedback = fRes.data || [];

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

        // Filtering
        const matchesProgram = currentProgramFilter === 'ALL' || (g.program && g.program.toUpperCase() === currentProgramFilter);
        const matchesSearch = !searchTerm ||
            (g.group_name && g.group_name.toLowerCase().includes(searchTerm)) ||
            (projectTitle && projectTitle.toLowerCase().includes(searchTerm));

        if (!matchesProgram || !matchesSearch) return;

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
    if (keyHint && parsed[keyHint]) return parsed[keyHint];
    return parsed.title1 || parsed.title2 || parsed.title3 || Object.values(parsed)[0] || 'Untitled Project';
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
        else if (votes.some(v => v && v.includes('Revision'))) resolved[fk] = 'Approved with Revisions';
        else if (votes.some(v => v && (v.includes('Approved') || v === 'Completed'))) resolved[fk] = 'Approved';
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

    document.getElementById('fileModal').style.display = 'flex';
};

function createSection(sectionTitle, fileObj, icon, categoryKey, group) {
    const section = document.createElement('div');
    section.style.marginBottom = '20px';

    const header = document.createElement('h4');
    header.innerHTML = `<span class="material-icons-round" style="font-size:16px; vertical-align:middle; margin-right:4px;">${icon}</span> ${sectionTitle}`;
    header.style.cssText = 'font-size: 0.85rem; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 10px;';
    section.appendChild(header);

    Object.entries(fileObj).forEach(([label, url]) => {
        if (label.endsWith('_revised') || !url) return;

        const itemContainer = document.createElement('div');
        itemContainer.style.cssText = 'background: white; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; overflow: hidden;';

        const item = document.createElement('div');
        item.className = 'file-item';
        item.style.cssText = 'padding: 10px 12px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; transition: all 0.2s;';

        let displayLabel = label.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
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
                loadPDF(revisedUrl, `Revised - ${displayLabel}`, label + '_revised');
            };
            itemContainer.appendChild(revItem);
        }
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
    viewerDiv.innerHTML = '';

    if (window.AdobeDC) {
        currentAdobeView = new AdobeDC.View({
            clientId: ADOBE_CLIENT_ID,
            divId: "adobe-dc-view"
        });
        currentAdobeView.previewFile({
            content: { location: { url: url } },
            metaData: { fileName: title }
        }, {
            embedMode: "FULL_WINDOW",
            showAnnotationTools: false,
            showLeftHandPanel: true,
            showDownloadPDF: true,
            showPrintPDF: true
        });
    } else {
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
