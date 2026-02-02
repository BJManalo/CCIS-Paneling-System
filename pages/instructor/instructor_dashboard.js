
// Initialize Supabase client
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

// Data storage
let allGroups = [];
let allDefenseStatuses = [];
let allStudents = [];
let allCapstoneFeedback = []; // Added
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
        const { data: groups, error: gError } = await supabaseClient
            .from('student_groups')
            .select('*');

        if (gError) throw gError;
        allGroups = groups || [];

        // Fetch all defense statuses
        const { data: statuses, error: sError } = await supabaseClient
            .from('defense_statuses')
            .select('*');

        if (sError) throw sError;
        allDefenseStatuses = statuses || [];

        // Fetch students
        const { data: students, error: stdError } = await supabaseClient
            .from('students')
            .select('*');

        if (stdError) throw stdError;
        allStudents = students || [];

        console.log('Instructor Name:', instructorName);
        console.log('Total Groups:', allGroups.length);
        console.log('Adviser Names in DB:', [...new Set(allGroups.map(g => g.adviser))]);

        // Fetch capstone feedback
        const { data: feedback, error: fError } = await supabaseClient
            .from('capstone_feedback')
            .select('*');
        if (fError) console.error('Error fetching feedback:', fError);
        allCapstoneFeedback = feedback || [];

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

    // Filter groups where I am the adviser
    const myGroups = allGroups.filter(g =>
        g.adviser && g.adviser.toLowerCase().trim() === instructorName.toLowerCase().trim()
    );

    const sections = [...new Set(myGroups.map(g => g.section).filter(Boolean))].sort();

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
        const dbAdviser = (g.adviser || '').toLowerCase().trim();
        const me = instructorName.toLowerCase().trim();
        const isMyGroup = dbAdviser.includes(me) || me.includes(dbAdviser);
        if (!isMyGroup) return false;

        const progMatch = program === 'ALL' || (g.program && g.program.toUpperCase() === program);
        const sectMatch = section === 'ALL' || (g.section && g.section === section);
        const searchMatch = !searchTerm ||
            (g.group_name && g.group_name.toLowerCase().includes(searchTerm)) ||
            (g.program && g.program.toLowerCase().includes(searchTerm));
        return progMatch && sectMatch && searchMatch;
    });

    // Helper to robustly get title text
    const getTitleText = (pTitle, keyHint) => {
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
    };

    const getStatusMap = (row) => {
        if (!row || !row.statuses) return {};
        let s = row.statuses;
        if (typeof s === 'string') { try { s = JSON.parse(s); } catch (e) { return {}; } }

        // Flatten for easy checking: if a key's value is an object (multi-panel), 
        // we consider the "overall" status based on panel consensus.
        const flat = {};
        Object.keys(s).forEach(fileKey => {
            const val = s[fileKey];
            if (typeof val === 'object' && val !== null) {
                const values = Object.values(val);
                if (values.some(v => v.includes('Approved'))) flat[fileKey] = 'Approved';
                else if (values.some(v => v.includes('Approve with Revisions'))) flat[fileKey] = 'Approve with Revisions';
                else if (values.some(v => v.includes('Rejected') || v.includes('Redefense'))) flat[fileKey] = 'Rejected';
                else flat[fileKey] = 'Pending';
            } else {
                flat[fileKey] = val || 'Pending';
            }
        });
        return flat;
    };

    displayRows = [];

    baseGroups.forEach(g => {
        const titleRow = allDefenseStatuses.find(ds => ds.group_id === g.id && ds.defense_type === 'Title Defense');
        const finalRow = allDefenseStatuses.find(ds => ds.group_id === g.id && ds.defense_type === 'Final Defense');
        const tMap = getStatusMap(titleRow);
        const fMap = getStatusMap(finalRow);

        const members = allStudents
            .filter(s => s.group_id === g.id)
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

        if (currentCategory === 'ALL') {
            let titleLabel = g.group_name;
            let statusBadge = '<span class="status-badge pending">Pending</span>';

            const approvedKey = Object.keys(tMap).find(k => tMap[k].toLowerCase().includes('approved'));

            // Final Approved requires BOTH Chapter 4 and Chapter 5 to be "Approved"
            const ch4Status = (fMap.ch4 || '').toLowerCase();
            const ch5Status = (fMap.ch5 || '').toLowerCase();
            const finalApproved = ch4Status.includes('approved') && ch5Status.includes('approved');

            if (finalApproved) {
                statusBadge = '<span class="status-badge approved">Completed</span>';
                titleLabel = `<strong>${getTitleText(g.project_title, approvedKey) || approvedKey || g.group_name}</strong>`;
            } else if (approvedKey) {
                statusBadge = '<span class="status-badge approved" style="background:#dbeafe; color:#2563eb;">Title Approved</span>';
                titleLabel = `<strong>${getTitleText(g.project_title, approvedKey)}</strong>`;
            } else if (Object.values(tMap).some(v => v.toLowerCase().includes('rejected'))) {
                const rejCount = Object.values(tMap).filter(v => v.toLowerCase().includes('rejected')).length;
                statusBadge = `<span class="status-badge rejected">${rejCount} Rejected</span>`;
                const firstRejKey = Object.keys(tMap).find(k => tMap[k].toLowerCase().includes('rejected'));
                titleLabel = getTitleText(g.project_title, firstRejKey) || firstRejKey;
            }
            displayRows.push({ ...baseObj, title: titleLabel, statusHtml: statusBadge });

        } else if (currentCategory === 'APPROVED') {
            Object.keys(tMap).forEach(k => {
                if (tMap[k].toLowerCase().includes('approved')) {
                    displayRows.push({
                        ...baseObj,
                        title: `<strong>${getTitleText(g.project_title, k)}</strong>`,
                        statusHtml: '<span class="status-badge approved">Title Approved</span>'
                    });
                }
            });
        } else if (currentCategory === 'REJECTED') {
            Object.keys(tMap).forEach(k => {
                if (tMap[k].toLowerCase().includes('rejected')) {
                    displayRows.push({
                        ...baseObj,
                        title: `<span style="color: #dc2626;">${getTitleText(g.project_title, k)}</span>`,
                        statusHtml: '<span class="status-badge rejected">Rejected</span>'
                    });
                }
            });
        } else if (currentCategory === 'COMPLETED') {
            // Strict check: Ch4 & Ch5 done
            const ch4 = (fMap.ch4 || '').toLowerCase();
            const ch5 = (fMap.ch5 || '').toLowerCase();
            if (ch4.includes('approved') && ch5.includes('approved')) {
                const approvedKey = Object.keys(tMap).find(k => tMap[k].toLowerCase().includes('approved'));
                displayRows.push({
                    ...baseObj,
                    title: `<strong>${getTitleText(g.project_title, approvedKey) || approvedKey || g.group_name}</strong>`,
                    statusHtml: '<span class="status-badge approved">Completed</span>'
                });
            }
        }
    });

    updateCounts(baseGroups);
    renderTable();
};

function updateCounts(groups) {
    const groupIds = groups.map(g => g.id);
    const relevantStatuses = allDefenseStatuses.filter(ds => groupIds.includes(ds.group_id));

    const getVals = (row) => {
        if (!row || !row.statuses) return [];
        let s = row.statuses;
        if (typeof s === 'string') { try { s = JSON.parse(s); } catch (e) { return []; } }

        const results = [];
        Object.values(s).forEach(val => {
            if (typeof val === 'object' && val !== null) {
                const inner = Object.values(val);
                if (inner.some(v => v.includes('Approved'))) results.push('Approved');
                else if (inner.some(v => v.includes('Rejected') || v.includes('Redefense'))) results.push('Rejected');
                else results.push('Pending');
            } else {
                results.push(val);
            }
        });
        return results;
    };

    let approvedTotal = 0;
    let rejectedTotal = 0;
    let completedTotal = 0;

    groupIds.forEach(id => {
        const titleRow = relevantStatuses.find(ds => ds.group_id === id && ds.defense_type === 'Title Defense');
        const finalRow = relevantStatuses.find(ds => ds.group_id === id && ds.defense_type === 'Final Defense');

        const tVals = getVals(titleRow);

        approvedTotal += tVals.filter(v => typeof v === 'string' && v.toLowerCase().includes('approved')).length;
        rejectedTotal += tVals.filter(v => typeof v === 'string' && v.toLowerCase().includes('rejected')).length;

        // Strict logic for Completed: Parse dictionary manually
        if (finalRow && finalRow.statuses) {
            let s = finalRow.statuses;
            if (typeof s === 'string') { try { s = JSON.parse(s); } catch (e) { s = {}; } }

            const isApproved = (val) => {
                if (!val) return false;
                if (typeof val === 'string') return val.toLowerCase().includes('approved');
                if (typeof val === 'object') return Object.values(val).some(v => v.toLowerCase().includes('approved'));
                return false;
            };

            if (isApproved(s.ch4) && isApproved(s.ch5)) {
                completedTotal += 1;
            }
        }
    });

    // Display Counts
    const titleEl = document.getElementById('countTitle');
    const preOralEl = document.getElementById('countPreOral');
    const finalEl = document.getElementById('countFinal');

    if (titleEl) titleEl.innerText = approvedTotal;
    if (preOralEl) preOralEl.innerText = rejectedTotal;
    if (finalEl) finalEl.innerText = completedTotal;
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

        const members = (row.members || '').split(',').filter(m => m.trim());
        const membersHtml = members.map(m => `<span class="chip">${m.trim()}</span>`).join('');

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
            <td>${row.statusHtml}</td>
            <td>
                <button onclick="openFileModal(${row.id})" 
                    style="background: var(--primary-color); color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; box-shadow: 0 2px 6px rgba(37, 99, 235, 0.2); transition: all 0.2s;"
                    onmouseover="this.style.transform='translateY(-1px)'"
                    onmouseout="this.style.transform='translateY(0)'">
                    <span class="material-icons-round" style="font-size: 16px;">folder_open</span>
                    View Files
                </button>
            </td>
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

        // Title Mapping logic (similar to panel)
        let displayLabel = label.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        if (categoryKey === 'titles' && group.project_title) {
            try {
                const projectTitles = typeof group.project_title === 'string' && group.project_title.startsWith('{')
                    ? JSON.parse(group.project_title)
                    : { title1: group.project_title };
                if (projectTitles[label]) displayLabel = projectTitles[label];
            } catch (e) { }
        }

        const item = document.createElement('div');
        item.style.cssText = 'padding: 10px 12px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; transition: all 0.2s;';
        item.onmouseover = () => item.style.background = '#f8fafc';
        item.onmouseout = () => item.style.background = 'transparent';
        item.onclick = () => loadPDF(url, displayLabel, label);

        item.innerHTML = `
            <span style="font-size: 0.9rem; font-weight: 500; color: #334155;">${displayLabel}</span>
            <span class="material-icons-round" style="font-size: 18px; color: var(--primary-color);">arrow_forward_ios</span>
        `;
        itemContainer.appendChild(item);

        // Feedback Display Area
        const feedbackArea = document.createElement('div');
        feedbackArea.style.cssText = 'padding: 10px 12px; background: #fdfdfd; border-top: 1px solid #f1f5f9;';

        // 1. Panel Remarks (from defense_statuses)
        const remarks = overallRemarks[label] || '-';
        const myStatus = overallStatuses[label] || 'Pending';

        feedbackArea.innerHTML = `
            <div style="margin-bottom: 8px;">
                <label style="font-size: 0.65rem; font-weight: 800; color: #94a3b8; display: block; text-transform: uppercase;">Panel Remarks</label>
                <div style="font-size: 0.8rem; color: #475569; line-height: 1.4; margin-top: 2px;">${remarks}</div>
            </div>
            <div style="display: flex; gap: 10px;">
                <div>
                    <label style="font-size: 0.65rem; font-weight: 800; color: #94a3b8; display: block; text-transform: uppercase;">Overall Status</label>
                    <span style="font-size: 0.75rem; font-weight: 700; color: var(--primary-color);">${myStatus}</span>
                </div>
            </div>
        `;

        // 2. Specific Panel Feedbacks/Comments (from capstone_feedback)
        const comments = allCapstoneFeedback.filter(cf => cf.group_id === group.id && cf.file_key === label);
        if (comments.length > 0) {
            const commentListHtml = comments.map(c => `
                <div style="padding: 6px; background: #fff; border-radius: 4px; border: 1px solid #f1f5f9; margin-top: 4px;">
                    <div style="font-size: 0.7rem; font-weight: 800; color: var(--primary-color); display: flex; justify-content: space-between;">
                        ${c.panelist_name}
                        <span style="color: #94a3b8; font-weight: 500;">${c.status || 'Pending'}</span>
                    </div>
                    <div style="font-size: 0.75rem; color: #64748b; margin-top: 2px;">${c.remarks || 'No remarks provided'}</div>
                </div>
            `).join('');

            feedbackArea.innerHTML += `
                <div style="margin-top: 10px;">
                    <label style="font-size: 0.65rem; font-weight: 800; color: #94a3b8; display: block; text-transform: uppercase;">Detailed Panel Comments</label>
                    ${commentListHtml}
                </div>
            `;
        }

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
            clientId: "8ebcb61f76d649989f2ae52da7014605",
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
