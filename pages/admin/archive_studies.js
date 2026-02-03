const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
const supabase = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

let allArchives = [];

document.addEventListener('DOMContentLoaded', () => {
    loadArchives();
    document.getElementById('searchInput').addEventListener('input', (e) => filterArchives(e.target.value));
});

async function loadArchives() {
    const list = document.getElementById('archivesList');
    const loading = document.getElementById('loadingState');
    const empty = document.getElementById('emptyState');

    if (!loading) return;

    const setStatus = (msg, isError = false) => {
        console.log(`[Archive Load] ${msg}`);
        loading.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; gap:10px;">
                ${isError ? '<span class="material-icons-round" style="color:red; font-size:40px;">error_outline</span>' : '<div class="spinner-small"></div>'}
                <p style="color: ${isError ? '#dc2626' : '#64748b'}; font-weight: 500;">${msg}</p>
            </div>
            <style>
                .spinner-small { width: 20px; height: 20px; border: 2px solid #f3f3f3; border-top: 2px solid var(--primary-color); border-radius: 50%; animation: spin 1s linear infinite; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
        `;
    };

    try {
        setStatus('Connecting to database...');

        // Timeout helper
        const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('Connection Timeout')), ms));
        const fetchSafe = (prom) => Promise.race([prom, timeout(15000)])
            .then(res => res)
            .catch(err => {
                console.warn('Fetch failed or timed out:', err);
                return { error: err, data: [] };
            });

        // 1. Fetch Groups (Critical)
        const { data: groups, error: gError } = await supabase.from('student_groups').select('*');
        if (gError) throw gError;

        setStatus(`Loaded ${groups.length} groups. Fetching details...`);

        // 2. Fetch Supporting Data
        const [dsRes, cfRes, studentsRes, schedRes, gradesRes] = await Promise.all([
            fetchSafe(supabase.from('defense_statuses').select('*')),
            fetchSafe(supabase.from('capstone_feedback').select('group_id, defense_type, status, user_name')),
            fetchSafe(supabase.from('students').select('id, group_id, full_name')),
            fetchSafe(supabase.from('schedules').select('*')),
            fetchSafe(supabase.from('grades').select('*'))
        ]);

        const statuses = dsRes.data || [];
        const feedbacks = cfRes.data || [];
        const students = studentsRes.data || [];
        const schedules = schedRes.data || [];
        const grades = gradesRes.data || [];

        setStatus(`Processing ${groups.length} groups...`);

        // Helper to identify final defense type
        const isFinal = (type) => {
            const t = String(type || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            return t.includes('final') || t.includes('chapter4') || t.includes('chapter5') || t.includes('caps2');
        };

        // 3. Filter & Process
        const archivedGroups = groups.map(g => {
            try {
                const gid = String(g.id);
                // Attach Members
                const groupStudents = students.filter(s => String(s.group_id) === gid);
                const members = groupStudents.map(s => s.full_name || 'Unknown Student');

                // Attach Panels
                const finalSched = schedules.find(s =>
                    String(s.group_id) === gid && isFinal(s.schedule_type || s.defense_type)
                );

                let panels = [];
                if (finalSched) {
                    panels = [finalSched.panel1, finalSched.panel2, finalSched.panel3, finalSched.panel4, finalSched.panel5].filter(p => p);
                } else {
                    const groupFeedbacks = feedbacks.filter(f => String(f.group_id) === gid);
                    panels = [...new Set(groupFeedbacks.map(f => f.user_name).filter(n => n))];
                }

                return { ...g, members, panels, groupStudents, finalSched };
            } catch (e) {
                console.error('Error processing group:', g.group_name, e);
                return null;
            }
        }).filter(g => {
            if (!g) return false;
            const gid = String(g.id);

            // CRITERION 1: Graded
            // Check if any student in group has a grade record for Final
            const studentIds = g.groupStudents.map(s => String(s.id));
            const hasGrade = grades.some(gr =>
                (studentIds.includes(String(gr.student_id))) &&
                (isFinal(gr.grade_type || gr.defense_type) || (g.finalSched && String(gr.schedule_id) === String(g.finalSched.id)))
            );
            if (hasGrade) return true;

            // CRITERION 2: Legacy Status "Completed"
            const relevantStatuses = statuses.filter(s => String(s.group_id) === gid && isFinal(s.defense_type));
            const legacyCompleted = relevantStatuses.some(record => {
                let sObj = record.statuses;
                if (!sObj) return false;
                if (typeof sObj === 'string') { try { sObj = JSON.parse(sObj); } catch (e) { return false; } }
                for (const k in sObj) {
                    for (const p in sObj[k]) {
                        if (String(sObj[k][p]).trim().toLowerCase() === 'completed') return true;
                    }
                }
                return false;
            });
            if (legacyCompleted) return true;

            // CRITERION 3: Feedback "Completed"
            const feedbackCompleted = feedbacks.some(f =>
                String(f.group_id) === gid &&
                isFinal(f.defense_type) &&
                String(f.status).trim().toLowerCase() === 'completed'
            );
            if (feedbackCompleted) return true;

            return false;
        });

        allArchives = archivedGroups;
        console.log(`[Archive] Total archived groups found: ${allArchives.length}`);
        renderList(allArchives);

    } catch (err) {
        console.error('Fatal Archive Error:', err);
        setStatus(`Failed to load archives: ${err.message}`, true);
    }
}

function renderList(groups) {
    const list = document.getElementById('archivesList');
    const loading = document.getElementById('loadingState');
    const empty = document.getElementById('emptyState');

    if (loading) loading.style.display = 'none';
    list.innerHTML = '';

    if (groups.length === 0) {
        list.style.display = 'none';
        if (empty) empty.style.display = 'flex';
        return;
    }

    list.style.display = 'block';
    if (empty) empty.style.display = 'none';

    groups.forEach(g => {
        const card = document.createElement('div');
        card.className = 'archive-card';

        let title = g.project_title || g.title || 'Untitled Project';
        if (typeof title === 'string' && title.trim().startsWith('{')) {
            try {
                const tObj = JSON.parse(title);
                title = tObj.title1 || Object.values(tObj)[0] || title;
            } catch (e) { }
        }

        const date = g.created_at ? new Date(g.created_at).getFullYear() : 'N/A';
        const membersStr = g.members && g.members.length > 0 ? g.members.join(', ') : 'No Members Listed';

        card.innerHTML = `
            <div class="archive-header">
                <div class="archive-title" style="flex:1;">${g.group_name}</div>
                <div class="program-badge" style="background:#f1f5f9; padding:4px 8px; border-radius:4px; font-size:0.75rem; font-weight:700; color:var(--primary-color);">${(g.program || 'N/A').toUpperCase()}</div>
            </div>
            <div style="font-size: 1rem; font-weight:700; color:#1e293b; margin-bottom:8px; line-height:1.4;">${title}</div>
            
            <div style="font-size: 0.85rem; color:#475569; margin-bottom:4px;">
                <span style="font-weight:600;">Members:</span> ${membersStr}
            </div>
             <div style="font-size: 0.85rem; color:#475569; margin-bottom:12px;">
                <span style="font-weight:600;">Adviser:</span> ${g.adviser || 'N/A'}
            </div>

            <div class="archive-details" style="font-size:0.8rem; border-top: 1px solid #f1f5f9; pt: 10px;">
                <span style="display:flex; align-items:center; gap:5px;"><span class="material-icons-round" style="font-size:16px;">calendar_today</span> ${date}</span>
                <span style="display:flex; align-items:center; gap:5px; color:#059669; font-weight:600;"><span class="material-icons-round" style="font-size:16px;">verified</span> Completed</span>
            </div>
        `;

        card.onclick = () => openDetails(g);
        list.appendChild(card);
    });
}

function filterArchives(term) {
    const lower = term.toLowerCase();
    const filtered = allArchives.filter(g =>
        (g.group_name || '').toLowerCase().includes(lower) ||
        (g.project_title || '').toLowerCase().includes(lower) ||
        (g.program || '').toLowerCase().includes(lower) ||
        (g.members || []).join(' ').toLowerCase().includes(lower)
    );
    renderList(filtered);
}

function openDetails(group) {
    const modal = document.getElementById('detailModal');
    const mTitle = document.getElementById('modalTitle');
    const mBody = document.getElementById('modalBody');

    let title = group.project_title || group.title || 'Untitled Project';
    if (typeof title === 'string' && title.trim().startsWith('{')) {
        try {
            const tObj = JSON.parse(title);
            title = tObj.title1 || Object.values(tObj)[0] || title;
        } catch (e) { }
    }

    mTitle.innerText = title;

    let finalLinks = group.final_link;
    let linksHtml = '<p style="font-style:italic; color:#94a3b8;">No final manuscripts attached.</p>';

    if (finalLinks) {
        try {
            if (finalLinks.startsWith('{')) {
                const fObj = JSON.parse(finalLinks);
                linksHtml = '<ul style="list-style:none; padding:0;">';
                for (const [key, url] of Object.entries(fObj)) {
                    linksHtml += `<li style="margin-bottom:8px;"><a href="${url}" target="_blank" style="color:var(--primary-color); display:flex; align-items:center; gap:8px; text-decoration:none; font-weight:500;"><span class="material-icons-round">description</span> ${key}</a></li>`;
                }
                linksHtml += '</ul>';
            } else {
                linksHtml = `<a href="${finalLinks}" target="_blank" style="color:var(--primary-color); display:flex; align-items:center; gap:8px; text-decoration:none; font-weight:500;"><span class="material-icons-round">description</span> View Manuscript</a>`;
            }
        } catch (e) {
            linksHtml = `<a href="${finalLinks}" target="_blank" style="color:var(--primary-color); display:flex; align-items:center; gap:8px; text-decoration:none; font-weight:500;"><span class="material-icons-round">description</span> View Manuscript</a>`;
        }
    }

    const membersList = group.members && group.members.length > 0
        ? group.members.map(m => `<li style="margin-bottom:4px;">${m}</li>`).join('')
        : '<li>No members found</li>';

    const panelsList = group.panels && group.panels.length > 0
        ? group.panels.map(p => `<li style="margin-bottom:4px;">${p}</li>`).join('')
        : '<li>No panel information available</li>';

    mBody.innerHTML = `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; background:#f8fafc; padding:20px; border-radius:15px;">
            <div>
                <h4 style="font-size:0.75rem; text-transform:uppercase; color:#64748b; margin-bottom:8px; letter-spacing:0.05em;">Group Info</h4>
                <p style="margin:4px 0;"><strong>Name:</strong> ${group.group_name}</p>
                <p style="margin:4px 0;"><strong>Program:</strong> ${(group.program || '').toUpperCase()}</p>
                <p style="margin:4px 0;"><strong>Adviser:</strong> ${group.adviser || 'N/A'}</p>
            </div>
             <div>
                <h4 style="font-size:0.75rem; text-transform:uppercase; color:#64748b; margin-bottom:8px; letter-spacing:0.05em;">Members</h4>
                <ul style="padding-left: 18px; margin: 0; font-size: 0.9rem; color: #334155;">
                    ${membersList}
                </ul>
            </div>
        </div>

        <div style="margin-bottom: 24px; padding:0 10px;">
             <h4 style="font-size:0.75rem; text-transform:uppercase; color:#64748b; margin-bottom:8px; letter-spacing:0.05em;">Panelists (Final Defense)</h4>
              <ul style="padding-left: 18px; margin: 0; font-size: 0.9rem; color: #334155;">
                    ${panelsList}
             </ul>
        </div>

        <div style="padding-top:20px; border-top:1px solid #e2e8f0;">
            <h4 style="margin-bottom:12px; font-size:0.9rem; color:#1e293b; display:flex; align-items:center; gap:8px;">
                <span class="material-icons-round" style="color:var(--primary-color);">attachment</span> Archived Documents
            </h4>
            <div style="background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:15px;">
                ${linksHtml}
            </div>
        </div>
    `;

    if (modal) modal.style.display = 'flex';
}

function closeModal() {
    const modal = document.getElementById('detailModal');
    if (modal) modal.style.display = 'none';
}

window.onclick = function (event) {
    const modal = document.getElementById('detailModal');
    if (event.target == modal) {
        closeModal();
    }
}
