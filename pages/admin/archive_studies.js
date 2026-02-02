const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
const supabase = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

let allArchives = [];

document.addEventListener('DOMContentLoaded', () => {
    loadArchives();

    document.getElementById('searchInput').addEventListener('input', (e) => {
        filterArchives(e.target.value);
    });
});

async function loadArchives() {
    const list = document.getElementById('archivesList');
    const loading = document.getElementById('loadingState');
    const empty = document.getElementById('emptyState');

    try {
        console.log('Starting loadArchives...');
        const { data: groups, error: gError } = await supabase
            .from('student_groups')
            .select('*');
        if (gError) throw gError;

        // Fetch supporting data safely
        const fetchSafe = (prom) => prom.then(res => res).catch(err => ({ error: err, data: [] }));

        // Optimize: select specific columns
        const dsRes = await fetchSafe(supabase.from('defense_statuses').select('*'));
        const cfRes = await fetchSafe(supabase.from('capstone_feedback').select('group_id, defense_type, status, user_name'));
        const studentsRes = await fetchSafe(supabase.from('students').select('group_id, first_name, last_name'));
        const schedRes = await fetchSafe(supabase.from('schedules').select('group_id, schedule_type, panel1, panel2, panel3, panel4, panel5'));

        if (dsRes.error) console.warn('Error fetching defense_statuses:', dsRes.error);
        if (cfRes.error) console.warn('Error fetching capstone_feedback:', cfRes.error);

        const statuses = dsRes.data || [];
        const feedbacks = cfRes.data || [];
        const students = studentsRes.data || [];
        const schedules = schedRes.data || [];

        // 3. Filter for Completed Final Defense
        const archivedGroups = groups.map(g => {
            // Attach Members
            const members = students.filter(s => String(s.group_id) === String(g.id)).map(s => `${s.first_name} ${s.last_name}`);

            // Attach Panels
            const finalSched = schedules.find(s =>
                String(s.group_id) === String(g.id) &&
                String(s.schedule_type || '').toLowerCase().replace(/[^a-z0-9]/g, '').includes('final')
            );

            let panels = [];
            if (finalSched) {
                panels = [finalSched.panel1, finalSched.panel2, finalSched.panel3, finalSched.panel4, finalSched.panel5].filter(p => p);
            } else {
                // Fallback: Check who gave feedback
                const groupFeedbacks = feedbacks.filter(f => String(f.group_id) === String(g.id));
                const uniquePanels = [...new Set(groupFeedbacks.map(f => f.user_name).filter(n => n))];
                panels = uniquePanels;
            }

            return { ...g, members, panels };
        }).filter(g => {
            // A. Check Legacy Data
            const relevantStatuses = statuses.filter(s =>
                String(s.group_id) === String(g.id) &&
                String(s.defense_type || '').toLowerCase().replace(/[^a-z0-9]/g, '').includes('final')
            );

            const legacyCompleted = relevantStatuses.some(record => {
                if (!record.statuses) return false;
                let sObj = record.statuses;
                if (typeof sObj === 'string') {
                    try { sObj = JSON.parse(sObj); } catch (e) { return false; }
                }
                for (const fileKey in sObj) {
                    const panelStatuses = sObj[fileKey];
                    for (const panelName in panelStatuses) {
                        if (String(panelStatuses[panelName]).trim().toLowerCase() === 'completed') return true;
                    }
                }
                return false;
            });

            if (legacyCompleted) return true;

            // B. Check New Feedback Data
            const feedbackCompleted = feedbacks.some(f =>
                f && f.group_id && f.status &&
                String(f.group_id) === String(g.id) &&
                String(f.defense_type || '').toLowerCase().replace(/[^a-z0-9]/g, '').includes('final') &&
                String(f.status).trim().toLowerCase() === 'completed'
            );

            return feedbackCompleted;
        });

        allArchives = archivedGroups;
        renderList(allArchives);

    } catch (err) {
        console.error('Error loading archives:', err);
        loading.style.display = 'none';
        list.innerHTML = `<div style="text-align:center; padding:20px; color:red;">Error loading archives. Please try refreshing.</div>`;
    }
}

function renderList(groups) {
    const list = document.getElementById('archivesList');
    const loading = document.getElementById('loadingState');
    const empty = document.getElementById('emptyState');

    loading.style.display = 'none';
    list.innerHTML = '';

    if (groups.length === 0) {
        list.style.display = 'none';
        empty.style.display = 'flex';
        return;
    }

    list.style.display = 'block';
    empty.style.display = 'none';

    groups.forEach(g => {
        const card = document.createElement('div');
        card.className = 'archive-card';

        // Parse title if JSON
        let title = g.project_title || g.title || 'Untitled';
        if (typeof title === 'string' && title.trim().startsWith('{')) {
            try {
                const tObj = JSON.parse(title);
                title = tObj.title1 || Object.values(tObj)[0] || title;
            } catch (e) { }
        }

        const date = new Date(g.created_at).getFullYear();
        const membersStr = g.members && g.members.length > 0 ? g.members.join(', ') : 'No Members Listed';
        const panelStr = g.panels && g.panels.length > 0 ? g.panels[0] + (g.panels.length > 1 ? ` +${g.panels.length - 1} more` : '') : 'No Panels';

        card.innerHTML = `
            <div class="archive-header">
                <div class="archive-title" style="flex:1;">${g.group_name}</div>
                <div class="program-badge" style="background:#f1f5f9; padding:4px 8px; border-radius:4px; font-size:0.75rem; font-weight:700;">${(g.program || 'N/A').toUpperCase()}</div>
            </div>
            <div style="font-size: 1rem; font-weight:700; color:#1e293b; margin-bottom:6px; line-height:1.4;">${title}</div>
            
            <div style="font-size: 0.85rem; color:#475569; margin-bottom:4px;">
                <strong>Members:</strong> ${membersStr}
            </div>
             <div style="font-size: 0.85rem; color:#475569; margin-bottom:10px;">
                <strong>Adviser:</strong> ${g.adviser || 'N/A'}
            </div>

            <div class="archive-details" style="font-size:0.8rem;">
                <span style="display:flex; align-items:center; gap:5px;"><span class="material-icons-round" style="font-size:16px;">calendar_today</span> Year: ${date}</span>
                <span style="display:flex; align-items:center; gap:5px;"><span class="material-icons-round" style="font-size:16px;">verified</span> Completed</span>
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

    let title = group.project_title || group.title || 'Untitled';
    if (typeof title === 'string' && title.trim().startsWith('{')) {
        try {
            const tObj = JSON.parse(title);
            title = tObj.title1 || Object.values(tObj)[0] || title;
        } catch (e) { }
    }

    mTitle.innerText = title;

    // Links decoding
    let finalLinks = group.final_link;
    let linksHtml = '<p style="font-style:italic; color:#94a3b8;">No final manuscripts available.</p>';

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
        ? group.members.map(m => `<li style="margin-bottom:2px;">${m}</li>`).join('')
        : '<li>No members found</li>';

    const panelsList = group.panels && group.panels.length > 0
        ? group.panels.map(p => `<li style="margin-bottom:2px;">${p}</li>`).join('')
        : '<li>No panels assigned</li>';

    mBody.innerHTML = `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
            <div>
                <h4 style="font-size:0.75rem; text-transform:uppercase; color:#94a3b8; margin-bottom:8px;">Group Information</h4>
                <p><strong>Group:</strong> ${group.group_name}</p>
                <p><strong>Program:</strong> ${(group.program || '').toUpperCase()}</p>
                <p><strong>Adviser:</strong> ${group.adviser || 'N/A'}</p>
            </div>
             <div>
                <h4 style="font-size:0.75rem; text-transform:uppercase; color:#94a3b8; margin-bottom:8px;">Members</h4>
                <ul style="padding-left: 20px; margin: 0; font-size: 0.9rem; color: #334155;">
                    ${membersList}
                </ul>
            </div>
        </div>

        <div style="margin-bottom: 20px;">
             <h4 style="font-size:0.75rem; text-transform:uppercase; color:#94a3b8; margin-bottom:8px;">Panelists (Final Defense)</h4>
              <ul style="padding-left: 20px; margin: 0; font-size: 0.9rem; color: #334155;">
                    ${panelsList}
             </ul>
        </div>

        <hr style="margin: 15px 0; border:0; border-top:1px solid #e2e8f0;">
        <h4 style="margin-bottom:10px; font-size:0.9rem; color:#1e293b;">Archived Documents</h4>
        ${linksHtml}
    `;

    modal.style.display = 'flex';
}

function closeModal() {
    document.getElementById('detailModal').style.display = 'none';
}

window.onclick = function (event) {
    const modal = document.getElementById('detailModal');
    if (event.target == modal) {
        closeModal();
    }
}
