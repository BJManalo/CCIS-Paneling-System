// instructor_payers.js

document.addEventListener('DOMContentLoaded', () => {
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
        // Use payment_date if available (Date Paid), else created_at
        const rawDate = p.payment_date || p.created_at;
        const date = new Date(rawDate).toLocaleDateString();

        // Main Row
        const row = document.createElement('tr');
        row.className = 'main-row';
        row.id = `row-${p.id}`;
        row.onclick = () => togglePayerRow(p.id);
        row.style.borderBottom = '1px solid #f1f5f9';

        row.innerHTML = `
            <td style="padding: 15px;">
                 <div style="display: flex; align-items: center; gap: 10px;">
                    <span class="material-icons-round expand-icon" id="icon-${p.id}">expand_more</span>
                    ${date}
                 </div>
            </td>
            <td style="padding: 15px; font-weight: 500;">${p.group_name || 'Unknown'}</td>
            <td style="padding: 15px;">
                <span style="background: #eef2ff; color: #4338ca; padding: 4px 10px; border-radius: 6px; font-size: 0.85em; font-weight: 600;">
                    ${p.defense_type || 'N/A'}
                </span>
            </td>
            <td style="padding: 15px;">${p.section || '-'}</td>
            <td style="padding: 15px;">
                <span style="font-size: 0.85em; color: var(--primary-color); font-weight: 600;">View Details</span>
            </td>
        `;
        tableBody.appendChild(row);

        // Details Row
        const detailsRow = document.createElement('tr');
        detailsRow.className = 'details-row';
        detailsRow.id = `details-${p.id}`;

        detailsRow.innerHTML = `
            <td colspan="5" style="padding: 0;">
                <div class="details-content">
                    <!-- Column 1: Members -->
                    <div class="details-column">
                        <h4>Group Members</h4>
                        <ul class="members-list">
                            ${p.members ? p.members.split(',').map(m => `<li>${m.trim()}</li>`).join('') : '<li>No members listed</li>'}
                        </ul>
                    </div>

                    <!-- Column 2: Academic Details -->
                    <div class="details-column">
                        <h4>Academic Details</h4>
                        <p><strong style="font-size: 0.8em; color: #64748b;">PROGRAM / YEAR / SECTION</strong><br>
                        ${p.program || '-'} ${p.year_level || ''} - ${p.section || '-'}</p>
                        
                        <p style="margin-top: 15px;"><strong style="font-size: 0.8em; color: #64748b;">ADVISER</strong><br>
                        ${p.adviser || '-'}</p>

                        <p style="margin-top: 15px;"><strong style="font-size: 0.8em; color: #64748b;">PANELS</strong><br>
                        ${p.panels || '-'}</p>
                    </div>

                    <!-- Column 3: Receipt -->
                    <div class="details-column receipt-column">
                        <h4>Receipt</h4>
                        <img src="${p.receipt_url}" 
                             style="width: 100%; max-width: 250px; height: auto; border-radius: 8px; border: 1px solid #e2e8f0; cursor: zoom-in; box-shadow: 0 2px 8px rgba(0,0,0,0.05);"
                             onclick="event.stopPropagation(); window.openLightbox(this.src);"
                             title="Click to Enlarge">
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
    const searchFilter = document.getElementById('searchInput') ? document.getElementById('searchInput').value.toLowerCase() : '';

    const filtered = allPayments.filter(p => {
        const matchesType = typeFilter ? (p.defense_type === typeFilter) : true;
        const matchesSection = sectionFilter ? (p.section === sectionFilter) : true;
        const matchesSearch = searchFilter ? (
            (p.group_name && p.group_name.toLowerCase().includes(searchFilter)) ||
            (p.members && p.members.toLowerCase().includes(searchFilter))
        ) : true;

        return matchesType && matchesSection && matchesSearch;
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
    window.location.href = '../../index.html';
}

