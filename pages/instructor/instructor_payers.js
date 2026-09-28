// instructor_payers.js

document.addEventListener('DOMContentLoaded', () => {
    // Check Login
    const loginUser = JSON.parse(localStorage.getItem('loginUser'));
    const role = (loginUser && loginUser.role) ? loginUser.role.trim().toLowerCase() : '';
    const allowedRoles = ['instructor', 'instructor/adviser', 'adviser'];

    if (!loginUser || !allowedRoles.includes(role)) {
        window.location.href = '../../';
        return;
    }

    // Ultra-Aggressive Eval Hide for Adviser-only
    const rawRole = (loginUser && loginUser.role) ? loginUser.role.toString().toLowerCase() : '';
    const isAdviser = rawRole.includes('adviser') || rawRole.includes('advisor');
    const hasOtherRole = rawRole.includes('instructor') || rawRole.includes('panel') || rawRole.includes('admin');

    if (isAdviser && !hasOtherRole) {
        document.querySelectorAll('.nav-item, a').forEach(nav => {
            const href = (nav.getAttribute('href') || '').toLowerCase();
            const text = (nav.textContent || '').toLowerCase();
            if (href.includes('evaluation') || text.includes('evaluation')) {
                nav.style.setProperty('display', 'none', 'important');
            }
        });
    }

    loadPayers();
});

let allPayments = [];
let currentPage = 1;
let currentProgram = 'ALL';
let currentSectionFilter = 'ALL';
const rowsPerPage = 15;

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

    const searchTerm = document.getElementById('searchInput') ? document.getElementById('searchInput').value.toLowerCase() : '';

    if (!payments || payments.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 30px;">No records found.</td></tr>';
        updatePaginationUI(0, payments);
        return;
    }

    // Grouping by group_name
    let groupedData = {};
    payments.forEach(p => {
        const gn = p.group_name || 'Unknown';
        if (!groupedData[gn]) {
            groupedData[gn] = {
                group_name: gn,
                program: p.program || 'N/A',
                section: p.section || '',
                adviser: p.adviser || 'Not Assigned',
                members: p.members || '',
                payments: []
            };
        }
        groupedData[gn].payments.push(p);
    });

    let groupsArray = Object.values(groupedData);

    let filteredGroups = groupsArray.filter(g => {
        const program = (g.program || '').toUpperCase();
        if (currentProgram !== 'ALL' && !program.includes(currentProgram)) return false;
        if (currentSectionFilter !== 'ALL' && g.section !== currentSectionFilter) return false;
        
        const gName = (g.group_name || '').toLowerCase();
        const gMem = (g.members || '').toLowerCase();
        if (searchTerm && !gName.includes(searchTerm) && !gMem.includes(searchTerm)) return false;
        
        return true;
    });

    const totalPages = Math.ceil(filteredGroups.length / rowsPerPage);
    if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * rowsPerPage;
    const paginatedGroups = filteredGroups.slice(startIndex, startIndex + rowsPerPage);

    if (paginatedGroups.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px;">No groups found matching criteria.</td></tr>';
        updatePaginationUI(totalPages, filteredGroups);
        return;
    }

    paginatedGroups.forEach(g => {
        const program = (g.program || '').toUpperCase();
        let progClass = program.includes('BSIS') ? 'prog-bsis' : program.includes('BSIT') ? 'prog-bsit' : program.includes('BSCS') ? 'prog-bscs' : 'prog-unknown';
        const groupAdviser = g.adviser !== 'Not Assigned' ? g.adviser.replace(/\(creator:[^)]+\)/, '').trim() : 'Not Assigned';
        
        const normGN = btoa(unescape(encodeURIComponent(g.group_name))).replace(/[^a-zA-Z0-9]/g, '');

        let accordionContentHtml = `
            <div class="defense-tabs" style="display:flex; border-bottom:1px solid #e2e8f0; margin-bottom:15px; background: white;">
                <button type="button" onclick="switchInnerTab('titledefense', '${normGN}', event)" class="inner-tab active inner-tab-${normGN}" id="tab-titledefense-${normGN}" style="padding:10px 20px; background:none; border:none; border-bottom:3px solid var(--primary-color); color:var(--primary-color); font-weight:700; cursor:pointer;">Title Defense</button>
                <button type="button" onclick="switchInnerTab('preoraldefense', '${normGN}', event)" class="inner-tab inner-tab-${normGN}" id="tab-preoraldefense-${normGN}" style="padding:10px 20px; background:none; border:none; border-bottom:3px solid transparent; color:#64748b; font-weight:500; cursor:pointer;">Pre-Oral Defense</button>
                <button type="button" onclick="switchInnerTab('finaldefense', '${normGN}', event)" class="inner-tab inner-tab-${normGN}" id="tab-finaldefense-${normGN}" style="padding:10px 20px; background:none; border:none; border-bottom:3px solid transparent; color:#64748b; font-weight:500; cursor:pointer;">Final Defense</button>
            </div>
            <div style="background:white; padding:15px; border-radius:8px; border:1px solid #e2e8f0;">
        `;

        const phases = [
            { key: 'titledefense', matchName: ['title defense'] },
            { key: 'preoraldefense', matchName: ['pre-oral defense', 'pre oral defense'] },
            { key: 'finaldefense', matchName: ['final defense'] }
        ];

        phases.forEach((phase, idx) => {
            const isActive = idx === 0 ? 'display:block;' : 'display:none;';
            const matchedPayment = g.payments.find(p => phase.matchName.includes((p.defense_type || '').toLowerCase().trim()));
            
            let contentHtml = '';
            if (matchedPayment) {
                const datePaid = new Date(matchedPayment.payment_date || matchedPayment.created_at).toLocaleDateString();
                const membersList = (matchedPayment.members || '').split(',').map(m => m.trim() ? `<span class="chip" style="margin-right:5px; margin-bottom:5px; display:inline-block; padding:4px 8px; border-radius:4px; font-size:12px; background:#eff6ff; color:#1e40af;">${m.trim()}</span>` : '').join('');
                
                contentHtml = `
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1.5fr; gap: 40px; align-items: start;">
                        <div>
                            <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.5px;">Members Info</div>
                            <div>${membersList || '<span style="color:#94a3b8; font-style:italic;">No Members Data</span>'}</div>
                        </div>
                        <div>
                            <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.5px;">Status Info</div>
                            <div style="font-size: 0.95rem; color: #334155; line-height: 1.6;">
                                <div style="margin-bottom: 8px;"><strong style="color: #1e293b;">Paid On:</strong> ${datePaid}</div>
                                <div><strong style="color: #1e293b;">Panels Assigned:</strong> ${matchedPayment.panels || '-'}</div>
                            </div>
                        </div>
                        <div class="receipt-column">
                            <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.5px;">Proof of Payment</div>
                            <div style="background: white; padding: 10px; border: 1px solid #e2e8f0; border-radius: 12px; display: inline-block;">
                                <img src="${matchedPayment.receipt_url}" style="width: 100%; max-width: 350px; height: auto; border-radius: 8px; cursor: zoom-in; display: block;" onclick="event.stopPropagation(); window.openLightbox(this.src);">
                            </div>
                        </div>
                    </div>
                `;
            } else {
                contentHtml = `<div style="text-align:center; padding:20px; color:#94a3b8; font-style:italic;">No payment recorded yet for ${phase.matchName[0]}</div>`;
            }

            accordionContentHtml += `
                <div class="inner-content inner-content-${normGN}" id="content-${phase.key}-${normGN}" style="${isActive}">
                    ${contentHtml}
                </div>
            `;
        });

        accordionContentHtml += `</div>`;

        const rowId = `row-${normGN}`;
        const accId = `details-${normGN}`;
        const iconId = `icon-${normGN}`;

        const mainRow = document.createElement('tr');
        mainRow.className = 'main-row';
        mainRow.id = rowId;
        mainRow.style.cursor = 'pointer';
        
        mainRow.onclick = () => {
            const acc = document.getElementById(accId);
            const icon = document.getElementById(iconId);
            if (acc.style.display === 'none' || acc.classList.contains('active') === false) {
                acc.style.display = 'table-row';
                acc.classList.add('active');
                icon.style.transform = 'rotate(180deg)';
                mainRow.style.background = '#f8fafc';
            } else {
                acc.style.display = 'none';
                acc.classList.remove('active');
                icon.style.transform = 'rotate(0deg)';
                mainRow.style.background = 'white';
            }
        };

        mainRow.innerHTML = `
            <td style="padding: 16px;">
                <div style="font-weight: 700; font-size:1.05rem; color:#0f172a;">${g.group_name}</div>
            </td>
            <td><span class="prog-badge ${progClass}">${program}</span></td>
            <td>
                <div style="font-size: 0.95rem; font-weight: 500; color: #334155; display:flex; align-items:center; gap:6px;">
                    <span class="material-icons-round" style="font-size:16px; color:#94a3b8;">school</span>
                    ${groupAdviser}
                </div>
            </td>
            <td style="text-align:right; padding-right:20px;">
                <span class="material-icons-round expand-icon" id="${iconId}" style="color:#94a3b8; transition:transform 0.3s; pointer-events:none; font-size: 24px;">expand_more</span>
            </td>
        `;

        const detailsRow = document.createElement('tr');
        detailsRow.className = 'details-row';
        detailsRow.id = accId;
        detailsRow.style.display = 'none';
        detailsRow.style.background = '#f8fafc';
        detailsRow.innerHTML = `<td colspan="4" style="padding: 20px 25px; border-bottom: 2px solid #e2e8f0; background: #f8fbff;">${accordionContentHtml}</td>`;

        tableBody.appendChild(mainRow);
        tableBody.appendChild(detailsRow);
    });

    updatePaginationUI(totalPages, filteredGroups);
}

// Ensure variable is defined at bottom level if we removed it inside replacement
var currentFilteredPayments = [];

function updatePaginationUI(totalPages, payments) {
    currentFilteredPayments = payments;
    let paginationContainer = document.getElementById('payersPagination');
    if (!paginationContainer) {
        const tableContainer = document.querySelector('.table-container') || document.querySelector('#payersTableBody').parentElement;
        if (tableContainer) {
            paginationContainer = document.createElement('div');
            paginationContainer.id = 'payersPagination';
            paginationContainer.className = 'pagination';
            paginationContainer.style.justifyContent = 'flex-end';
            tableContainer.after(paginationContainer);
        } else {
            return;
        }
    }

    if (totalPages <= 1) {
        paginationContainer.style.display = 'none';
        return;
    }

    paginationContainer.style.display = 'flex';
    
    paginationContainer.innerHTML = `
        <button class="page-btn prev" ${currentPage === 1 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : `onclick="changePage(${currentPage - 1})"`}>Previous</button>
        <span class="page-number active">${currentPage}</span>
        <button class="page-btn next" ${currentPage === totalPages ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : `onclick="changePage(${currentPage + 1})"`}>Next</button>
    `;
}

window.changePage = (newPage) => {
    currentPage = newPage;
    renderPayers(currentFilteredPayments);
};

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
    currentPage = 1;
    const typeFilter = document.getElementById('filterDefenseType') ? document.getElementById('filterDefenseType').value : '';
    const sectionFilter = document.getElementById('filterSection') ? document.getElementById('filterSection').value : '';
    const programFilter = document.getElementById('filterProgram') ? document.getElementById('filterProgram').value : '';
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
// old search listener removed

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


window.filterTable = (program) => {
    const btns = document.querySelectorAll('.filter-btn:not(.status-btn)');
    if (currentProgram === program) {
        currentProgram = 'ALL';
        currentSectionFilter = 'ALL';
        btns.forEach(btn => btn.classList.remove('active'));
        currentPage = 1;
        renderPayers(allPayments);
        return;
    }

    const sections = new Set();
    allPayments.filter(p => (p.program || '').toUpperCase().includes(program)).forEach(p => {
        if (p.section) sections.add(p.section);
    });
    const sectionArr = Array.from(sections).sort();
    let optionsHtml = '<option value="ALL">All Sections</option>';
    sectionArr.forEach(sec => optionsHtml += `<option value="${sec}">${sec}</option>`);

    Swal.fire({
        title: `Filter ${program}`,
        html: `
            <div style="text-align: left; margin-top: 15px;">
                <label style="font-weight: 600; color: #475569; font-size: 14px; display: block; margin-bottom: 8px;">Select Section:</label>
                <select id="sectionFilterSelect" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #cbd5e1; outline: none; font-size: 15px; font-family: 'Outfit';">
                    ${optionsHtml}
                </select>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Apply Filter',
        confirmButtonColor: 'var(--primary-color)',
        cancelButtonText: 'Cancel'
    }).then((result) => {
        if (result.isConfirmed) {
            currentProgram = program;
            currentSectionFilter = document.getElementById('sectionFilterSelect').value;
            btns.forEach(btn => btn.classList.toggle('active', btn.innerText === program));
            currentPage = 1;
            renderPayers(allPayments);
        }
    });
};

window.switchInnerTab = (tabId, groupNameNorm, event) => {
    if (event) event.preventDefault();
    document.querySelectorAll(`.inner-tab-${groupNameNorm}`).forEach(btn => {
        btn.classList.remove('active');
        btn.style.color = '#64748b';
        btn.style.borderBottomColor = 'transparent';
        btn.style.fontWeight = '500';
    });
    document.querySelectorAll(`.inner-content-${groupNameNorm}`).forEach(content => {
        content.style.display = 'none';
    });
    const activeBtn = document.getElementById(`tab-${tabId}-${groupNameNorm}`);
    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.style.color = 'var(--primary-color)';
        activeBtn.style.borderBottomColor = 'var(--primary-color)';
        activeBtn.style.fontWeight = '700';
    }
    const activeContent = document.getElementById(`content-${tabId}-${groupNameNorm}`);
    if (activeContent) {
        activeContent.style.display = 'block';
    }
};
