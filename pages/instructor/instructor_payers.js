// instructor_payers.js

document.addEventListener('DOMContentLoaded', () => {
    // Check Login
    const loginUser = JSON.parse(localStorage.getItem('loginUser'));
    if (!loginUser || (loginUser.role !== 'Instructor' && loginUser.role !== 'Instructor/Adviser' && loginUser.role !== 'Adviser')) {
        window.location.href = '../../';
        return;
    }

    // Hide Evaluations link from nav for 'Adviser' role
    if (loginUser.role && loginUser.role.trim() === 'Adviser') {
        const evalNav = document.querySelector('a[href*="instructor_evaluation"]');
        if (evalNav) evalNav.style.display = 'none';
    }

    loadPayers();
});

let allPayments = [];

async function loadPayers() {
    const tableBody = document.getElementById('payersTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 30px;">Loading...</td></tr>';

    try {
        const { data: payments, error } = await supabaseClient
            .from('payments')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        allPayments = payments;
        renderPayers(allPayments);

    } catch (err) {
        console.error('Error loading payers:', err);
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 30px; color: red;">Error loading data.</td></tr>';
    }
}

function renderPayers(payments) {
    const tableBody = document.getElementById('payersTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (!payments || payments.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 30px;">No records found.</td></tr>';
        return;
    }

    payments.forEach(p => {
        const rawDate = p.payment_date || p.created_at;
        const date = new Date(rawDate).toLocaleDateString();
        const program = (p.program || '').toUpperCase();

        let progClass = 'prog-unknown';
        if (program.includes('BSIS')) progClass = 'prog-bsis';
        else if (program.includes('BSIT')) progClass = 'prog-bsit';
        else if (program.includes('BSCS')) progClass = 'prog-bscs';

        // Members chips
        const memberList = (p.members || '').split(',').filter(m => m.trim());
        const membersHtml = memberList.map(m => `<span class="chip">${m.trim()}</span>`).join('');

        // Main Row
        const row = document.createElement('tr');
        row.className = 'main-row';
        row.id = `row-${p.id}`;
        row.onclick = () => togglePayerRow(p.id);

        row.innerHTML = `
            <td style="padding: 16px;">
                 <div style="display: flex; align-items: center; gap: 10px;">
                    <span class="material-icons-round expand-icon" id="icon-${p.id}" style="font-size: 18px;">expand_more</span>
                    <span style="font-weight: 600; color: #1e293b;">${date}</span>
                 </div>
            </td>
            <td style="font-weight: 700; color: var(--primary-dark);">${p.group_name || 'Unknown'}</td>
            <td>
                <span class="prog-badge ${progClass}">${program || 'N/A'}</span>
            </td>
            <td>
                <div class="chips-container">
                    ${membersHtml || '<span style="color:#94a3b8; font-style:italic; font-size:11px;">No Members</span>'}
                </div>
            </td>
            <td>
                <span style="font-size: 0.85em; color: var(--primary-color); font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                    <span class="material-icons-round" style="font-size: 16px;">visibility</span>
                    Details
                </span>
            </td>
        `;
        tableBody.appendChild(row);

        // Details Row
        const detailsRow = document.createElement('tr');
        detailsRow.className = 'details-row';
        detailsRow.id = `details-${p.id}`;

        detailsRow.innerHTML = `
            <td colspan="5" style="padding: 0;">
                <div class="details-content" style="padding: 20px 25px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1.5fr; gap: 40px; align-items: start;">
                        <div>
                            <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.5px;">Academic Context</div>
                            <div style="font-size: 0.95rem; color: #334155; line-height: 1.6;">
                                <div style="margin-bottom: 8px;"><strong style="color: #1e293b;">Type:</strong> ${p.defense_type || 'N/A'}</div>
                                <div style="margin-bottom: 8px;"><strong style="color: #1e293b;">Year/Section:</strong> ${p.year_level || ''} - ${p.section || '-'}</div>
                                <div><strong style="color: #1e293b;">Adviser:</strong> ${p.adviser || '-'}</div>
                            </div>
                        </div>
                        <div>
                            <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.5px;">Status Info</div>
                            <div style="font-size: 0.95rem; color: #334155; line-height: 1.6;">
                                <div style="margin-bottom: 8px;"><strong style="color: #1e293b;">Paid For:</strong> ${p.defense_type || 'N/A'}</div>
                                <div><strong style="color: #1e293b;">Panels:</strong> ${p.panels || '-'}</div>
                            </div>
                        </div>
                        <div class="receipt-column">
                            <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.5px;">Proof of Payment</div>
                            <div style="background: white; padding: 10px; border: 1px solid #e2e8f0; border-radius: 12px; display: inline-block;">
                                <img src="${p.receipt_url}" 
                                     style="width: 100%; max-width: 350px; height: auto; border-radius: 8px; cursor: zoom-in; display: block;"
                                     onclick="event.stopPropagation(); window.openLightbox(this.src);">
                            </div>
                        </div>
                    </div>
                </div>
            </td>
        `;
        tableBody.appendChild(detailsRow);
    });
}

// Toggle Function
window.togglePayerRow = function (id) {
    const detailsRow = document.getElementById(`details-${id}`);
    const mainRow = document.getElementById(`row-${id}`);

    if (detailsRow) {
        detailsRow.classList.toggle('active');
        if (mainRow) mainRow.classList.toggle('expanded');
    }
}

function filterPayers() {
    const typeFilter = document.getElementById('filterDefenseType').value;
    const sectionFilter = document.getElementById('filterSection').value;
    const programFilter = document.getElementById('filterProgram').value;
    const searchFilter = document.getElementById('searchInput') ? document.getElementById('searchInput').value.toLowerCase() : '';

    const filtered = allPayments.filter(p => {
        const matchesType = typeFilter ? (p.defense_type === typeFilter) : true;
        const matchesSection = sectionFilter ? (p.section === sectionFilter) : true;
        const matchesProgram = programFilter ? (p.program === programFilter) : true;
        const matchesSearch = searchFilter ? (
            (p.group_name && p.group_name.toLowerCase().includes(searchFilter)) ||
            (p.members && p.members.toLowerCase().includes(searchFilter))
        ) : true;

        return matchesType && matchesSection && matchesProgram && matchesSearch;
    });

    renderPayers(filtered);
}

// Search Listener
document.getElementById('searchInput')?.addEventListener('input', filterPayers);

// Lightbox Logic (Reused)
function openLightbox(imageUrl) {
    const modal = document.getElementById('lightboxModal');
    const img = document.getElementById('lightboxImage');
    if (modal && img) {
        img.src = imageUrl;
        modal.style.display = 'flex'; // Explicit Flex
    }
}

function closeLightbox() {
    const modal = document.getElementById('lightboxModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../';
}

