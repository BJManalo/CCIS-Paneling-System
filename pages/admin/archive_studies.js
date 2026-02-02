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
        // 1. Fetch Groups
        const { data: groups, error: gError } = await supabase
            .from('student_groups')
            .select('*');
        if (gError) throw gError;

        // 2. Fetch Defense Statuses for 'Final Defense'
        // We fetch ALL statuses to filter client side for flexibility
        const { data: statuses, error: sError } = await supabase
            .from('defense_statuses')
            .select('*');
        if (sError) throw sError;

        // 3. Filter for Completed Final Defense
        // Condition: Has a record for Final Defense AND status includes "Completed"
        const archivedGroups = groups.filter(g => {
            // Check if group is marked explicitly as "Completed" in logic or if Final Defense passed
            // We look at defense_statuses table
            const relevantStatuses = statuses.filter(s =>
                s.group_id === g.id &&
                s.defense_type.toLowerCase().replace(/[^a-z0-9]/g, '').includes('final')
            );

            if (relevantStatuses.length === 0) return false;

            // Logic: If ANY final defense record is marked 'Completed'
            return relevantStatuses.some(record => {
                if (!record.statuses) return false;

                let sObj = record.statuses;
                if (typeof sObj === 'string') {
                    try { sObj = JSON.parse(sObj); } catch (e) { return false; }
                }

                // Check for "Completed" status in any panel's feedback
                for (const fileKey in sObj) {
                    const panelStatuses = sObj[fileKey];
                    // panelStatuses is { "PanelName": "Status" }
                    // If any panel marked it "Completed" OR if the system aggregated it to "Completed"
                    // Usually we want ALL panels to complete, but let's stick to if the record implies completion.
                    // The user said: "when Chapter 4 and Chapter 5 was input by panels that equals to completed... mark as completed"

                    // Simple check: if value 'Completed' exists in the status map
                    for (const panelName in panelStatuses) {
                        if (panelStatuses[panelName] === 'Completed') return true;
                    }
                }
                return false;
            });
        });

        allArchives = archivedGroups;
        renderList(allArchives);

    } catch (err) {
        console.error('Error loading archives:', err);
        loading.innerText = 'Error loading archives.';
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

        // Format Members
        let members = [];
        // Ideally we would fetch members from 'students' table but for simplicity valid for MVP if we don't display names yet, 
        // OR we can make a joined query. 'student_groups' might not have member names in it?
        // Let's check 'students' table if needed.
        // Actually, previous files fetched 'students' separately. 
        // Admin View usually doesn't need detailed names immediately, but let's be nice.
        // For now, I'll display Group Name and Program.

        const date = new Date(g.created_at).getFullYear(); // Approximation of year

        card.innerHTML = `
            <div class="archive-header">
                <div class="archive-title">${g.group_name}</div>
                <div class="program-badge" style="background:#f1f5f9; padding:4px 8px; border-radius:4px; font-size:0.8rem; font-weight:700;">${(g.program || 'N/A').toUpperCase()}</div>
            </div>
            <div style="font-size: 1rem; font-weight:600; color:#1e293b; margin-bottom:10px;">${title}</div>
            <div class="archive-details">
                <span style="display:flex; align-items:center; gap:5px;"><span class="material-icons-round" style="font-size:16px;">calendar_today</span> Year: ${date}</span>
                <span style="display:flex; align-items:center; gap:5px;"><span class="material-icons-round" style="font-size:16px;">check_circle</span> Status: Completed</span>
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
        (g.program || '').toLowerCase().includes(lower)
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
    let linksHtml = '<p>No final manuscripts available.</p>';

    if (finalLinks) {
        try {
            if (finalLinks.startsWith('{')) {
                const fObj = JSON.parse(finalLinks);
                linksHtml = '<ul style="list-style:none;">';
                for (const [key, url] of Object.entries(fObj)) {
                    linksHtml += `<li style="margin-bottom:8px;"><a href="${url}" target="_blank" style="color:var(--primary-color); display:flex; align-items:center; gap:8px;"><span class="material-icons-round">description</span> ${key}</a></li>`;
                }
                linksHtml += '</ul>';
            } else {
                linksHtml = `<a href="${finalLinks}" target="_blank" style="color:var(--primary-color); display:flex; align-items:center; gap:8px;"><span class="material-icons-round">description</span> View Manuscript</a>`;
            }
        } catch (e) {
            linksHtml = `<a href="${finalLinks}" target="_blank" style="color:var(--primary-color); display:flex; align-items:center; gap:8px;"><span class="material-icons-round">description</span> View Manuscript</a>`;
        }
    }

    mBody.innerHTML = `
        <p><strong>Group:</strong> ${group.group_name}</p>
        <p><strong>Program:</strong> ${(group.program || '').toUpperCase()}</p>
        <p><strong>Adviser:</strong> ${group.adviser || 'N/A'}</p>
        <hr style="margin: 15px 0; border:0; border-top:1px solid #eee;">
        <h4 style="margin-bottom:10px;">Archived Documents</h4>
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

function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../index.html';
}
