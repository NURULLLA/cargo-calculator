// import { Packer, CONFIG } from './packer.js?v=9';
// import { MainDeckViz } from './ui_visualizer_main.js';
// import { LowerDeckViz } from './ui_visualizer_3d.js?v=2.3';

// The app will now use global Packer, CONFIG, MainDeckViz, and LowerDeckViz

class CargoApp {
    constructor() {
        this.cargo = [];
        this.results = null;
        this.currentTab = 'input-tab';

        this.mdViz = new MainDeckViz('main-deck-3d');
        this.ldViz = new LowerDeckViz('lower-deck-3d');

        this.init();
    }

    init() {
        // Tab switching
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // Add item
        document.getElementById('btn-add-item').addEventListener('click', () => this.addCargoItem());

        // Excel Import
        const excelBtn = document.getElementById('btn-import-excel');
        const excelInput = document.getElementById('excel-upload');
        if (excelBtn && excelInput) {
            excelBtn.addEventListener('click', () => excelInput.click());
            excelInput.addEventListener('change', (e) => this.handleExcelImport(e));
        }

        // Calculate
        document.getElementById('btn-calculate').addEventListener('click', () => this.calculate());

        // Paste from Excel
        const pasteBtn = document.getElementById('btn-paste-excel');
        const pasteModal = document.getElementById('paste-modal');
        const pasteArea = document.getElementById('paste-area');
        if (pasteBtn && pasteModal) {
            pasteBtn.addEventListener('click', () => {
                pasteModal.style.display = 'flex';
                setTimeout(() => pasteArea.focus(), 100);
            });
            // Close on backdrop click
            pasteModal.addEventListener('click', (e) => {
                if (e.target === pasteModal) pasteModal.style.display = 'none';
            });
            // Live preview
            pasteArea.addEventListener('input', () => this.previewPastedExcel());
            pasteArea.addEventListener('paste', () => setTimeout(() => this.previewPastedExcel(), 50));
            // Confirm import
            document.getElementById('btn-paste-confirm').addEventListener('click', () => {
                const count = this.importPastedExcel();
                if (count > 0) {
                    pasteModal.style.display = 'none';
                    pasteArea.value = '';
                    document.getElementById('paste-preview').innerHTML = '';
                    this.showImportStatus(`✅ Добавлено ${count} позиций из вставленных данных`, 'success');
                }
            });
        }

        // Initial render
        this.renderInventory();
    }

    async handleExcelImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        const statusEl = document.getElementById('import-status');
        if (statusEl) {
            statusEl.textContent = 'Processing Excel file...';
            statusEl.className = 'import-status success';
            statusEl.style.display = 'block';
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                this.processExcelData(jsonData);
                event.target.value = ''; // Reset input
            } catch (err) {
                console.error("Excel Import Error:", err);
                if (statusEl) {
                    statusEl.textContent = 'Error parsing Excel: ' + err.message;
                    statusEl.className = 'import-status error';
                }
            }
        };
        reader.readAsArrayBuffer(file);
    }

    processExcelData(rows) {
        if (!rows || rows.length < 2) {
            this.showImportStatus('No data found in Excel', 'error');
            return;
        }

        const headers = Array.from(rows[0] || []).map(h => String(h || '').trim().toLowerCase());
        const dataRows = rows.slice(1);

        // Fuzzy Column Mapping
        const getColIdx = (aliases) => {
            // Priority 1: Exact match
            let idx = headers.findIndex(h => aliases.some(a => h === a.toLowerCase()));
            if (idx !== -1) return idx;
            
            // Priority 2: Starts with
            idx = headers.findIndex(h => aliases.some(a => h.startsWith(a.toLowerCase())));
            if (idx !== -1) return idx;

            // Priority 3: Includes (only for longer aliases)
            return headers.findIndex(h => aliases.some(a => a.length > 2 && h.includes(a.toLowerCase())));
        };

        const colMapping = {
            name: getColIdx(['box', 'item name', 'name', 'description of goods', 'description', 'batch', 'cargo', 'box #']),
            width: getColIdx(['w cm', 'width', 'w (cm)', 'breadth', 'w']),
            length: getColIdx(['d cm', 'l cm', 'length', 'l (cm)', 'depth', 'd', 'l']),
            height: getColIdx(['h cm', 'height', 'h (cm)', 'h']),
            sizeCol: getColIdx(['size', 'size of per carton', 'dimensions', 'meas']),
            weight: getColIdx(['gross weight', 'weight', 'kg', 'wt', 'kgs', 'weight kg']),
            qty: getColIdx(['total cartoon', 'total carton', 'qty', 'quantity', 'count', 'units', 'pcs', 'ctns']),
            tip: getColIdx(['tip', 'rotate', 'tipping', 'allow tipping']),
            lowerDeck: getColIdx(['lower deck', 'ld', 'lower', 'only lower'])
        };

        console.log("Column Mapping:", colMapping);

        let importCount = 0;
        let skipCount = 0;

        dataRows.forEach((row, idx) => {
            // Skip empty rows
            if (!row || row.length === 0 || !row.some(cell => cell !== null && cell !== '')) {
                return;
            }

            const name = colMapping.name !== -1 && row[colMapping.name] ? String(row[colMapping.name]) : `Item ${idx + 1}`;
            let l = colMapping.length !== -1 ? parseFloat(row[colMapping.length]) : NaN;
            let w = colMapping.width !== -1 ? parseFloat(row[colMapping.width]) : NaN;
            let h = colMapping.height !== -1 ? parseFloat(row[colMapping.height]) : NaN;
            
            // Parse combined size column if individual dimensions are missing
            if ((isNaN(l) || isNaN(w) || isNaN(h)) && colMapping.sizeCol !== -1) {
                const sizeStr = String(row[colMapping.sizeCol] || '');
                // Regex to find all numbers, including decimals (e.g., 65, 45.5, 30)
                const nums = sizeStr.match(/\d+(\.\d+)?/g);
                if (nums && nums.length >= 3) {
                    l = parseFloat(nums[0]);
                    w = parseFloat(nums[1]);
                    h = parseFloat(nums[2]);
                }
            }

            const wt = colMapping.weight !== -1 ? parseFloat(row[colMapping.weight]) : NaN;
            const qty = colMapping.qty !== -1 ? parseInt(row[colMapping.qty]) || 1 : 1;
            
            // Handle optional flags from Excel
            let allowTipping = true;
            if (colMapping.tip !== -1) {
                const tipVal = String(row[colMapping.tip] || '').toLowerCase();
                if (tipVal === 'no' || tipVal === 'false' || tipVal === '0' || tipVal === 'n') allowTipping = false;
            }

            let lowerDeckOnly = false;
            if (colMapping.lowerDeck !== -1) {
                const ldVal = String(row[colMapping.lowerDeck] || '').toLowerCase();
                if (ldVal === 'yes' || ldVal === 'true' || ldVal === '1' || ldVal === 'y') lowerDeckOnly = true;
            }

            if (isNaN(l) || isNaN(w) || isNaN(h) || isNaN(wt)) {
                console.warn(`Skipping row ${idx + 2}: Invalid dimensions/weight`, row);
                skipCount++;
                return;
            }

            this.cargo.push({
                id: Date.now() + Math.random(),
                name,
                length: l,
                width: w,
                height: h,
                weight: wt,
                count: qty,
                allowTipping: allowTipping,
                noStack: false,
                priority: false,
                mainDeckOnly: false,
                lowerDeckOnly: lowerDeckOnly
            });
            importCount++;
        });

        this.renderInventory();
        this.showImportStatus(`Imported ${importCount} items. ${skipCount > 0 ? `Skipped ${skipCount} invalid rows.` : ''}`, 'success');
    }

    showImportStatus(msg, type) {
        const statusEl = document.getElementById('import-status');
        if (statusEl) {
            statusEl.textContent = msg;
            statusEl.className = `import-status ${type}`;
            statusEl.style.display = 'block';
            setTimeout(() => {
                statusEl.style.display = 'none';
            }, 5000);
        }
    }

    switchTab(tabId) {
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));

        const panel = document.getElementById(tabId);
        const navBtn = document.querySelector(`[data-tab="${tabId}"]`);
        if (!panel || !navBtn) { console.warn('Unknown tab:', tabId); return; }
        panel.classList.add('active');
        navBtn.classList.add('active');

        this.currentTab = tabId;

        // Update Title
        const titles = {
            'input-tab':      { h1: 'Cargo Inventory',  p: 'Define batch dimensions and quantities' },
            'main-deck-tab':  { h1: 'Main Deck Plan',   p: '3D Visualization of Upper Deck Pallets' },
            'lower-deck-tab': { h1: 'Lower Deck Plan',  p: 'Hold utilization and bulk cargo layout' },
            'summary-tab':    { h1: 'Load Summary',     p: 'Final payload distribution and reports' }
        };
        const title = titles[tabId];
        if (title) {
            document.getElementById('tab-title').textContent = title.h1;
            document.getElementById('tab-subtitle').textContent = title.p;
        }

        // Trigger scene updates if needed
        if (tabId === 'main-deck-tab') {
            this.mdViz.onResize();
            this.updateMainDeckViz();
        }
        if (tabId === 'lower-deck-tab') {
            this.ldViz.onResize();
            this.updateLowerDeckViz();
        }
    }

    addCargoItem() {
        const name = document.getElementById('item-name').value || `Batch ${this.cargo.length + 1}`;
        const l = parseFloat(document.getElementById('item-l').value);
        const w = parseFloat(document.getElementById('item-w').value);
        const h = parseFloat(document.getElementById('item-h').value);
        const wt = parseFloat(document.getElementById('item-wt').value);
        const qty = parseInt(document.getElementById('item-qty').value);
        const tip = document.getElementById('item-tip').checked;
        const noStack = document.getElementById('item-no-stack').checked;
        const priority = document.getElementById('item-priority').checked;
        const mainDeckOnly = document.getElementById('main-deck-only').checked;
        const lowerDeckOnly = document.getElementById('lower-deck-only').checked;

        if (mainDeckOnly && lowerDeckOnly) {
            alert("An item cannot be both Main Deck Only and Lower Deck Only");
            return;
        }

        if (isNaN(l) || isNaN(w) || isNaN(h) || isNaN(wt) || isNaN(qty)) {
            alert("Please enter valid numbers");
            return;
        }

        this.cargo.push({
            id: Date.now(),
            name,
            length: l,
            width: w,
            height: h,
            weight: wt,
            count: qty,
            allowTipping: tip,
            noStack,
            priority,
            mainDeckOnly,
            lowerDeckOnly
        });
        this.renderInventory();

        // Reset form fields after adding item
        document.getElementById('item-name').value = '';
        document.getElementById('item-qty').value = '1';
        document.getElementById('item-priority').checked = false;
        document.getElementById('main-deck-only').checked = false;
        document.getElementById('lower-deck-only').checked = false;
    }

    removeCargoItem(id) {
        this.cargo = this.cargo.filter(c => c.id !== id);
        this.renderInventory();
    }

    renderInventory() {
        const tbody = document.querySelector('#inventory-table tbody');
        tbody.innerHTML = '';

        this.cargo.forEach(item => {
            const tr = document.createElement('tr');
            const totalWt = item.count * item.weight;
            tr.innerHTML = `
                <td>${item.priority ? '<i class="fas fa-star" style="color:#fbbf24;" title="Priority"></i> ' : ''}${item.name}</td>
                <td>${item.length}x${item.width}x${item.height}</td>
                <td>${item.weight} kg</td>
                <td style="font-weight:bold; color:var(--accent);">${totalWt.toLocaleString()} kg</td>
                <td>
                    ${item.count} 
                    ${item.noStack ? '<span class="badge" style="background:#ef4444; color:white; padding:2px 4px; border-radius:4px; font-size:0.7em;">Top Only</span>' : ''}
                    ${item.mainDeckOnly ? '<span class="badge" style="background:#0ea5e9; color:white; padding:2px 4px; border-radius:4px; font-size:0.7em;">Main Deck Only</span>' : ''}
                    ${item.lowerDeckOnly ? '<span class="badge" style="background:#8b5cf6; color:white; padding:2px 4px; border-radius:4px; font-size:0.7em;">Lower Deck Only</span>' : ''}
                    ${item.allowTipping ? '<span class="badge" style="background:#10b981; color:white; padding:2px 4px; border-radius:4px; font-size:0.7em;" title="Can be tipped/rotated"><i class="fas fa-rotate"></i> Tip OK</span>' : '<span class="badge" style="background:#6b7280; color:white; padding:2px 4px; border-radius:4px; font-size:0.7em;" title="Must stay upright"><i class="fas fa-up-long"></i> No Tip</span>'}
                </td>
                <td>
                    <button class="btn-danger" data-id="${item.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tr.querySelector('.btn-danger').addEventListener('click', () => this.removeCargoItem(item.id));
            tbody.appendChild(tr);
        });
    }

    calculate() {
        console.log("Starting calculation...");

        const configCode = document.getElementById('config-select').value;
        const aircraftId = document.getElementById('aircraft-select').value;
        try {
            this.results = Packer.packAircraft(configCode, this.cargo, { aircraftId });
            // Calculate total flights needed for all cargo
            this.flightPlan = Packer.calculateTotalFlights(configCode, this.cargo, { aircraftId });
        } catch (e) {
            console.error("Packer Error:", e);
            alert("Calculation Error: " + e.message);
            return;
        }

        console.log("Pack Results:", this.results);
        console.log("Flight Plan:", this.flightPlan);
        this.renderResultsUI(configCode);
        this.switchTab('summary-tab');
    }

    renderResultsUI(configCode) {
        // Update Summary Stats
        const totalW = this.results.pallets.reduce((acc, p) => acc + p.currentWeight, 0) +
            this.results.lowerDeck.reduce((acc, h) => acc + h.current_weight, 0);

        const currentConfig = CONFIG.PALLET_OPTIONS[configCode];
        let totalGross = (currentConfig.count * currentConfig.tare_weight) +
            this.results.lowerDeck.reduce((acc, h) => acc + h.current_weight, 0);
        let totalVolume = 0;

        this.results.pallets.forEach(p => {
            totalGross += p.currentWeight;
            p.layers.forEach(l => {
                if (l.dim_cross && l.dim_long && l.height && l.count) {
                    totalVolume += (l.dim_cross * l.dim_long * l.height * l.count) / 1000000;
                }
            });
        });

        // Lower Deck Volume
        this.results.lowerDeck.forEach(h => {
            h.compartments.forEach(c => {
                if (c.volume && !isNaN(c.volume)) {
                    totalVolume += c.volume;
                }
            });
        });

        const maxLimit = this.results.maxGrossLimit;
        const loadPercentage = ((totalGross / maxLimit) * 100).toFixed(1);
        const limitColor = totalGross > maxLimit * 0.95 ? '#ef4444' : 'var(--accent)';

        // Requested vs Capability
        const requestedNet = this.cargo.reduce((acc, i) => acc + (i.weight * i.count), 0);
        const totalTare = currentConfig.count * currentConfig.tare_weight;
        const maxNetCapability = maxLimit - totalTare;

        const isNetOverload = requestedNet > maxNetCapability;
        const netColor = isNetOverload ? '#ef4444' : 'var(--text)';

        document.getElementById('total-weight').innerHTML = `
            <span class="wt-gross">
                ${isNetOverload ? '<i class="fas fa-triangle-exclamation" style="color:var(--danger);margin-right:3px;"></i>' : ''}
                Gross: ${totalGross.toLocaleString()} / ${maxLimit.toLocaleString()} kg <span style="color:var(--text-muted);font-weight:400;">(${loadPercentage}%)</span>
            </span>
            <span class="wt-net">Net loaded: ${totalW.toLocaleString()} kg &nbsp;·&nbsp; Vol: ${totalVolume.toFixed(1)} m³</span>
            <span class="wt-net">Requested: ${requestedNet.toLocaleString()} kg &nbsp;·&nbsp; Tare: ${totalTare.toLocaleString()} kg</span>
            ${isNetOverload ? '<span class="wt-warn"><i class="fas fa-exclamation-triangle"></i> Structural limit exceeded</span>' : ''}
        `;

        // Total Boxes Calculation
        const mdTotalBoxes = this.results.pallets.reduce((acc, p) =>
            acc + p.layers.reduce((lAcc, l) => lAcc + l.count, 0), 0);
        const ldTotalBoxes = this.results.lowerDeck.reduce((acc, h) =>
            acc + h.compartments.reduce((cAcc, c) =>
                cAcc + c.items.reduce((iAcc, i) => iAcc + i.count, 0), 0), 0);

        document.getElementById('md-total-boxes').textContent = mdTotalBoxes.toLocaleString();
        document.getElementById('ld-total-boxes').textContent = ldTotalBoxes.toLocaleString();

        // Update Viz Stats
        const mdWeight = this.results.pallets.reduce((acc, p) => acc + p.currentWeight, 0);
        const ldWeight = this.results.lowerDeck.reduce((acc, h) => acc + h.current_weight, 0);
        document.getElementById('md-payload').textContent = mdWeight.toLocaleString();
        document.getElementById('ld-payload').textContent = ldWeight.toLocaleString();
        const filledPos = this.results.pallets.filter(p => p.currentWeight > 0).length;
        const totalPos = CONFIG.PALLET_OPTIONS[configCode].count;
        document.getElementById('md-pos').textContent = `${filledPos}/${totalPos}`;
        const mdPosSummary = document.getElementById('md-pos-summary');
        if (mdPosSummary) mdPosSummary.textContent = `${filledPos} / ${totalPos} positions`;

        const leftoversCount = this.results.leftovers.reduce((acc, i) => acc + i.count, 0);
        document.getElementById('total-leftovers').textContent = leftoversCount;

        const leftoverCard = document.getElementById('leftover-card');
        const leftoverList = document.getElementById('leftover-list');
        leftoverList.innerHTML = '';

        if (leftoversCount > 0) {
            leftoverCard.style.display = 'block';
            this.results.leftovers.forEach(item => {
                const div = document.createElement('div');
                div.className = 'leftover-item';
                div.style.cssText = 'padding:0.4rem 0.2rem; border-bottom:1px solid var(--border); font-size:0.85rem;';
                const reason = item.lowerDeckOnly ? 'LowerDeckOnly — too large for any hold door'
                    : item.weight > 75 ? 'Lower Deck Only — exceeds 75 kg manual handling limit'
                    : 'Could not fit (Limit or Space)';
                div.innerHTML = `<strong>${item.name}</strong>: <span style="color:var(--danger)">${item.count} units</span> — <span style="color:var(--text-muted)">${reason}</span>`;
                leftoverList.appendChild(div);
            });
        } else {
            leftoverCard.style.display = 'none';
        }

        // ─── FLIGHT PLAN PANEL ─────────────────────────────────────────────
        this.renderFlightPlan();
        // ────────────────────────────────────────────────────────────────────

        // Render Report
        this.renderReport();
    }

    renderFlightPlan() {
        // Find or create the flight-plan card in the summary tab
        let card = document.getElementById('flight-plan-card');
        if (!card) {
            // Create the card and inject it after the leftover-card
            card = document.createElement('div');
            card.id = 'flight-plan-card';
            card.className = 'card';
            const leftoverCard = document.getElementById('leftover-card');
            if (leftoverCard && leftoverCard.parentNode) {
                leftoverCard.parentNode.insertBefore(card, leftoverCard.nextSibling);
            } else {
                document.getElementById('summary-tab').appendChild(card);
            }
        }

        const fp = this.flightPlan;
        if (!fp) { card.style.display = 'none'; return; }
        card.style.display = '';

        const totalBoxes = this.cargo.reduce((acc, i) => acc + i.count, 0);
        const statusColor = fp.allCleared ? '#10b981' : '#f59e0b';
        const statusText  = fp.allCleared ? '✅ All cargo cleared' : '⚠️ Some cargo cannot be loaded (physical limits)';

        let html = `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.75rem;">
                <h3 style="margin:0; font-size:1rem; color:var(--text);"><i class="fas fa-plane"></i> Flights Required</h3>
                <span style="background:${statusColor}22; color:${statusColor}; border:1px solid ${statusColor}44;
                    padding:3px 10px; border-radius:20px; font-size:0.8rem; font-weight:600;">
                    ${fp.totalFlights} flight${fp.totalFlights !== 1 ? 's' : ''}
                </span>
            </div>
            <p style="font-size:0.82rem; color:var(--text-muted); margin:0 0 0.75rem;">
                Total cargo: <strong>${totalBoxes.toLocaleString()} units</strong> — ${statusText}
            </p>
            <table style="width:100%; border-collapse:collapse; font-size:0.82rem;">
                <thead>
                    <tr style="border-bottom:2px solid var(--border); color:var(--text-muted);">
                        <th style="text-align:left; padding:4px 6px;">Flight #</th>
                        <th style="text-align:right; padding:4px 6px;">Loaded</th>
                        <th style="text-align:right; padding:4px 6px;">Main Deck</th>
                        <th style="text-align:right; padding:4px 6px;">Lower Deck</th>
                        <th style="text-align:right; padding:4px 6px;">Remaining</th>
                    </tr>
                </thead>
                <tbody>`;

        fp.flightBreakdown.forEach((f, idx) => {
            const rowBg = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.03)';
            const accentFlightNum = f.flightNum === 1 ? 'var(--accent)' : 'var(--text)';
            html += `
                <tr style="background:${rowBg};">
                    <td style="padding:5px 6px; color:${accentFlightNum}; font-weight:${f.flightNum===1?'700':'400'};">✈ Flight ${f.flightNum}${f.flightNum===1?' <small style="color:var(--text-muted);">(current)</small>':''}</td>
                    <td style="text-align:right; padding:5px 6px; font-weight:600;">${f.loaded.toLocaleString()}</td>
                    <td style="text-align:right; padding:5px 6px; color:var(--text-muted);">${f.mdLoaded.toLocaleString()}</td>
                    <td style="text-align:right; padding:5px 6px; color:var(--text-muted);">${f.ldLoaded.toLocaleString()}</td>
                    <td style="text-align:right; padding:5px 6px; color:${f.leftoverCount > 0 ? '#f59e0b' : '#10b981'}; font-weight:600;">${f.leftoverCount.toLocaleString()}</td>
                </tr>`;
        });

        html += `</tbody></table>`;

        if (!fp.allCleared) {
            const stuck = fp.flightBreakdown[fp.flightBreakdown.length - 1]?.leftovers || [];
            if (stuck.length > 0) {
                html += `<div style="margin-top:0.75rem; padding:0.5rem; background:#f59e0b11; border:1px solid #f59e0b44; border-radius:6px; font-size:0.8rem; color:#f59e0b;">
                    <strong>⚠ Cannot be loaded (physical constraints):</strong><br>
                    ${stuck.map(i => `${i.name}: ${i.count} units`).join('<br>')}
                </div>`;
            }
        }

        card.innerHTML = html;
    }

    renderReport() {
        const container = document.getElementById('position-report');
        container.innerHTML = '';

        // Main Deck
        this.results.pallets.forEach(p => {
            if (p.currentWeight === 0) return;
            const palletBoxes = p.layers.reduce((acc, l) => acc + l.count, 0);
            const weightPrc = (p.currentWeight / p.maxNetWeight * 100).toFixed(0);
            
            const item = document.createElement('div');
            item.className = 'report-item';
            item.style.flexDirection = 'column';
            item.style.gap = '0.75rem';
            
            item.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <strong style="color:var(--accent); font-size:1.1rem;">Pos ${p.id}</strong>
                        <span style="color:var(--text-muted); margin-left:8px;">${p.config.code}</span>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:700;">${p.currentWeight.toLocaleString()} / ${p.maxNetWeight.toLocaleString()} kg</div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">${weightPrc}% Weight Capacity</div>
                    </div>
                </div>
                
                <div style="width:100%; height:6px; background:rgba(255,255,255,0.05); border-radius:3px; overflow:hidden;">
                    <div style="width:${weightPrc}%; height:100%; background:var(--accent); border-radius:3px;"></div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-size:0.9rem;">
                        <i class="fas fa-boxes" style="margin-right:5px; color:var(--text-muted);"></i>
                        <strong>${palletBoxes}</strong> boxes loaded
                    </div>
                    <button class="btn-sm btn-secondary" style="padding:4px 12px; font-size:0.75rem;">
                        <i class="fas fa-list"></i> View Manifest
                    </button>
                </div>
            `;
            
            item.querySelector('button').onclick = () => this.showPalletManifest(p);
            container.appendChild(item);
        });

        // Lower Deck
        this.results.lowerDeck.forEach(hold => {
            hold.compartments.forEach(comp => {
                const compBoxes = comp.items.reduce((acc, i) => acc + i.count, 0);

                // Always show C4 even if no cargo — because it has the tech kit reservation
                const isC4 = comp.id === 'C4';
                if (compBoxes === 0 && !isC4) return;

                const item = document.createElement('div');
                item.className = 'report-item';

                // For C4, show tech kit reservation badge
                const techKitBadge = isC4
                    ? `<span style="display:inline-block;margin-top:4px;padding:2px 8px;border-radius:12px;
                        background:#f9731622;border:1px solid #f97316;color:#f97316;font-size:0.75em;">
                        🔧 Tech Kit (spare wheels + jack): <strong>300 kg</strong> reserved
                       </span>`
                    : '';

                item.innerHTML = `
                    <span><strong>${comp.name}</strong>${compBoxes > 0 ? ` - ${compBoxes} boxes` : ' — no bulk cargo'}</span>
                    <span>${comp.weight.toLocaleString()} kg${isC4 ? ' <small style="color:var(--text-muted)">(+300 reserved)</small>' : ''}</span>
                    ${techKitBadge ? `<div style="grid-column:1/-1;">${techKitBadge}</div>` : ''}
                `;
                container.appendChild(item);

                if (compBoxes === 0) return; // no manifest to show

                // Add Details Button for Lower Deck
                const btn = document.createElement('button');
                btn.className = 'btn-sm btn-secondary';
                btn.innerHTML = '<i class="fas fa-list"></i> View Manifest';
                btn.style.marginTop = '0.5rem';
                btn.onclick = () => this.showLowerDeckManifest(comp);
                item.appendChild(btn);
            });
        });
    }

    updateMainDeckViz() {
        if (this.results) this.mdViz.update(this.results);
    }

    updateLowerDeckViz() {
        if (this.results) this.ldViz.update(this.results);
    }

    showPalletManifest(pallet) {
        const totalBoxes = pallet.layers.reduce((acc, l) => acc + l.count, 0);
        let html = `
            <div class="manifest-header">
                <h3><i class="fas fa-pallet"></i> Manifest: Pallet ${pallet.id}</h3>
                <div style="color:var(--text-muted); font-size:0.9rem;">Equipment: ${pallet.config.code} (${pallet.config.width_long}x${pallet.config.length_cross}x${pallet.config.max_height} cm)</div>
            </div>

            <div class="manifest-summary-bar">
                <div class="m-stat">
                    <span class="m-stat-label">Net Weight</span>
                    <span class="m-stat-value">${pallet.currentWeight.toLocaleString()} kg</span>
                </div>
                <div class="m-stat">
                    <span class="m-stat-label">Total Items</span>
                    <span class="m-stat-value">${totalBoxes} units</span>
                </div>
                <div class="m-stat">
                    <span class="m-stat-label">Layers</span>
                    <span class="m-stat-value">${pallet.layers.length}</span>
                </div>
            </div>

            <table class="manifest-table">
                <thead>
                    <tr>
                        <th style="width:80px;">Layer</th>
                        <th style="width:100px;">Height</th>
                        <th>Box Description</th>
                        <th style="text-align:right;">Quantity</th>
                    </tr>
                </thead>
                <tbody>`;

        let cumulativeHeight = 0;
        pallet.layers.forEach((l, idx) => {
            cumulativeHeight += l.height;
            html += `
                <tr>
                    <td><span class="manifest-layer-num">#${idx + 1}</span></td>
                    <td>
                        <div>${l.height} cm</div>
                        <div style="font-size:0.7em; color:var(--text-muted);">Sum: ${cumulativeHeight} cm</div>
                    </td>
                    <td>
                        <div style="font-weight:600;">${l.box_name}</div>
                        <div class="manifest-meta">
                            ${l.meta && l.meta.main ? `<i class="fas fa-th"></i> ${l.meta.main.r}r × ${l.meta.main.c}c` : ''}
                            ${l.meta && l.meta.side ? ` <span style="margin-left:8px;"><i class="fas fa-rotate"></i> Side: ${l.meta.side.r}r × ${l.meta.side.c}c</span>` : ''}
                        </div>
                    </td>
                    <td style="text-align:right; font-weight:700; color:var(--accent); font-size:1.1rem;">
                        ${l.count}
                    </td>
                </tr>`;
        });

        html += `
                </tbody>
            </table>
            <div class="manifest-footer">
                <i class="fas fa-check-circle"></i> End of Manifest for Pallet ${pallet.id}
            </div>
        `;

        this.showModal(html);
    }

    showLowerDeckManifest(comp) {
        const totalBoxes = comp.items.reduce((acc, i) => acc + i.count, 0);
        let html = `
            <div class="manifest-header">
                <h3><i class="fas fa-box-open"></i> Manifest: ${comp.name}</h3>
                <div style="color:var(--text-muted); font-size:0.9rem;">Compartment ID: ${comp.id}</div>
            </div>

            <div class="manifest-summary-bar">
                <div class="m-stat">
                    <span class="m-stat-label">Gross Weight</span>
                    <span class="m-stat-value">${comp.weight.toLocaleString()} kg</span>
                </div>
                <div class="m-stat">
                    <span class="m-stat-label">Total Units</span>
                    <span class="m-stat-value">${totalBoxes} units</span>
                </div>
            </div>

            <table class="manifest-table">
                <thead>
                    <tr>
                        <th style="width:60px;">#</th>
                        <th>Batch / Item Name</th>
                        <th style="width:140px;">Dimensions</th>
                        <th style="text-align:right;">Quantity</th>
                    </tr>
                </thead>
                <tbody>`;

        comp.items.forEach((item, idx) => {
            html += `
                <tr>
                    <td><span class="manifest-layer-num">${idx + 1}</span></td>
                    <td>
                        <div style="font-weight:600;">${item.name}</div>
                        <div class="manifest-meta">Bulk Load</div>
                    </td>
                    <td>${item.l}x${item.w}x${item.h} cm</td>
                    <td style="text-align:right; font-weight:700; color:var(--accent); font-size:1.1rem;">
                        ${item.count}
                    </td>
                </tr>`;
        });

        html += `
                </tbody>
            </table>
            <div class="manifest-footer">
                <i class="fas fa-check-circle"></i> End of Manifest for ${comp.id}
            </div>
        `;

        this.showModal(html);
    }

    showModal(content) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-card">
                <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                ${content}
            </div>
        `;
        document.body.appendChild(modal);
    }

    // ─── PASTE FROM EXCEL ───────────────────────────────────────────────────
    _parsePasteText(text) {
        const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) return [];

        // Parse TSV (tab-separated, as copied from Excel)
        const rows = lines.map(l => l.split('\t').map(c => c.trim()));
        const headers = Array.from(rows[0] || []).map(h => String(h || '').trim().toLowerCase());

        const findCol = (aliases) => {
            let idx = headers.findIndex(h => aliases.some(a => h === a));
            if (idx !== -1) return idx;
            idx = headers.findIndex(h => aliases.some(a => h.startsWith(a)));
            if (idx !== -1) return idx;
            return headers.findIndex(h => aliases.some(a => a.length > 2 && h.includes(a)));
        };

        const cols = {
            name:    findCol(['description of goods', 'description', 'item name', 'name', 'batch', 'box', 'cargo']),
            qty:     findCol(['total cartoon', 'total carton', 'qty', 'quantity', 'cartons', 'ctns', 'count', 'pcs', 'units']),
            weight:  findCol(['gross weight', 'weight per carton', 'weight', 'gross wt', 'kg', 'wt', 'kgs']),
            size:    findCol(['size of per carton', 'size per carton', 'size', 'dimensions', 'meas', 'l x w x h']),
            length:  findCol(['l cm', 'd cm', 'length', 'l (cm)', 'l']),
            width:   findCol(['w cm', 'width', 'w (cm)', 'w']),
            height:  findCol(['h cm', 'height', 'h (cm)', 'h']),
        };

        const items = [];
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || !row.some(c => c)) continue;

            const name = cols.name !== -1 && row[cols.name] ? row[cols.name] : `Item ${i}`;
            let l = cols.length !== -1 ? parseFloat(row[cols.length]) : NaN;
            let w = cols.width  !== -1 ? parseFloat(row[cols.width])  : NaN;
            let h = cols.height !== -1 ? parseFloat(row[cols.height]) : NaN;

            // Parse from combined size column e.g. "65 x 45.5 x 30" or "50*50*55"
            if ((isNaN(l) || isNaN(w) || isNaN(h)) && cols.size !== -1 && row[cols.size]) {
                const nums = row[cols.size].match(/\d+(\.\d+)?/g);
                if (nums && nums.length >= 3) {
                    l = parseFloat(nums[0]);
                    w = parseFloat(nums[1]);
                    h = parseFloat(nums[2]);
                }
            }

            const wt  = cols.weight !== -1 ? parseFloat(row[cols.weight]) : NaN;
            const qty = cols.qty    !== -1 ? (parseInt(row[cols.qty]) || 1) : 1;

            if (isNaN(l) || isNaN(w) || isNaN(h) || isNaN(wt) || l <= 0 || w <= 0 || h <= 0 || wt <= 0) continue;

            items.push({ name, length: l, width: w, height: h, weight: wt, count: qty });
        }
        return items;
    }

    previewPastedExcel() {
        const text = document.getElementById('paste-area').value;
        const items = this._parsePasteText(text);
        const preview = document.getElementById('paste-preview');
        if (items.length === 0) {
            preview.innerHTML = '<span style="color:#ef4444;">⚠️ Данные не распознаны. Убедитесь что первая строка — заголовки.</span>';
            return;
        }
        let html = `<span style="color:#10b981;">✅ Найдено ${items.length} позиций:</span><br><div style="margin-top:6px; max-height:100px; overflow-y:auto;">`;
        items.slice(0, 5).forEach(it => {
            html += `<div style="padding:2px 0; border-bottom:1px solid var(--border);">📦 <strong>${it.name}</strong> — ${it.count} шт | ${it.length}×${it.width}×${it.height} см | ${it.weight} кг</div>`;
        });
        if (items.length > 5) html += `<div style="color:var(--text-muted); padding-top:4px;">... и ещё ${items.length - 5} позиций</div>`;
        html += '</div>';
        preview.innerHTML = html;
    }

    importPastedExcel() {
        const text = document.getElementById('paste-area').value;
        const items = this._parsePasteText(text);
        if (items.length === 0) {
            alert('Данные не распознаны. Убедитесь, что вы скопировали строку с заголовками и данные.');
            return 0;
        }
        items.forEach(it => {
            this.cargo.push({
                id: Date.now() + Math.random(),
                name: it.name,
                length: it.length,
                width: it.width,
                height: it.height,
                weight: it.weight,
                count: it.count,
                allowTipping: true,
                noStack: false,
                priority: false,
                mainDeckOnly: false,
                lowerDeckOnly: false
            });
        });
        this.renderInventory();
        return items.length;
    }
    // ────────────────────────────────────────────────────────────────────────

    optimize() {
        if (!this.results || this.results.pallets.filter(p => p.currentWeight > 0).length === 0) {
            alert("Calculate load first");
            return;
        }

        const btn = document.getElementById('btn-optimize');
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Shuffling...';
        btn.disabled = true;

        setTimeout(() => {
            const configCode = document.getElementById('config-select').value;
            const palletConfig = CONFIG.PALLET_OPTIONS[configCode];

            // Get loaded pallets and pick random target positions for them
            let activePallets = this.results.pallets.filter(p => p.currentWeight > 0);
            let availablePositions = Array.from({ length: palletConfig.count }, (_, i) => i + 1);
            this.shuffleArray(availablePositions);
            let targetPositions = availablePositions.slice(0, activePallets.length).sort((a, b) => a - b);

            // Reassign position IDs on the existing pallet objects (no re-packing!)
            activePallets.forEach((p, idx) => {
                p.id = targetPositions[idx];
            });

            // Rebuild full pallet array — active pallets in new slots, rest empty
            const newPallets = [];
            for (let i = 1; i <= palletConfig.count; i++) {
                const active = activePallets.find(p => p.id === i);
                if (active) {
                    newPallets.push(active);
                } else {
                    // Use correct weight field: weight_limits per position or default_weight
                    const wLimit = palletConfig.weight_limits[i] || palletConfig.default_weight;
                    newPallets.push({
                        id: i,
                        config: palletConfig,
                        layers: [],
                        currentWeight: 0,
                        currentHeight: 0,
                        maxNetWeight: wLimit - palletConfig.tare_weight,
                        zone: i === 1 ? 'NOSE' : (i === palletConfig.count ? 'TAIL' : 'MIDDLE')
                    });
                }
            }

            this.results.pallets = newPallets;

            // Update report and visualization only — NO re-packing
            this.renderReport();
            this.mdViz.update(this.results);

            btn.innerHTML = originalHtml;
            btn.disabled = false;
        }, 500);
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
}

window.app = new CargoApp();
