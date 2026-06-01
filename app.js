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

    // ═══════════════════════════════════════════════════════════════
    //  MANIFEST — MAIN DECK PALLET (визуальная схема)
    // ═══════════════════════════════════════════════════════════════
    showPalletManifest(pallet) {
        const totalBoxes = pallet.layers.reduce((a, l) => a + l.count, 0);
        const pct = Math.round((pallet.currentWeight / pallet.maxNetWeight) * 100);

        const modal = document.createElement('div');
        modal.className = 'mf-overlay';
        modal.innerHTML = `
            <div class="mf-modal">
                <div class="mf-header">
                    <div>
                        <h2 class="mf-title">&#9992; СХЕМА ПОГРУЗКИ &mdash; Позиция ${pallet.id} (${pallet.config.code})</h2>
                        <div class="mf-header-badges">
                            <span class="mf-badge mf-badge-blue">&#9878; ${pallet.currentWeight.toLocaleString()} / ${pallet.maxNetWeight.toLocaleString()} кг (${pct}%)</span>
                            <span class="mf-badge mf-badge-green">&#128230; ${totalBoxes} коробок</span>
                            <span class="mf-badge mf-badge-gray">&#128207; Высота стопки: ${pallet.currentHeight} см</span>
                            <span class="mf-badge mf-badge-gray">Поддон: ${pallet.config.length_cross}&times;${pallet.config.width_long}&times;${pallet.config.max_height} см</span>
                        </div>
                    </div>
                    <button class="mf-close" onclick="this.closest('.mf-overlay').remove()">&times;</button>
                </div>
                <div class="mf-orient-banner">
                    <div class="mf-orient-inner">
                        <span class="mf-nose">&#9668; НОС САМОЛЁТА</span>
                        <div class="mf-fuselage-line"><span class="mf-fuselage-label">ФЮЗЕЛЯЖ</span></div>
                        <span class="mf-tail">ХВОСТ &#9658;</span>
                    </div>
                    <p class="mf-orient-hint">Поддон загружается через боковую дверь. Длинная сторона поддона идёт <strong>поперёк фюзеляжа</strong> (от борта к борту). ${pallet.config.length_cross} см &mdash; поперёк, ${pallet.config.width_long} см &mdash; вдоль.</p>
                </div>
                <div class="mf-section">
                    <h3 class="mf-section-title">&#128208; Вид сбоку &mdash; все слои</h3>
                    ${this._renderElevationSVG(pallet)}
                </div>
                <div class="mf-section">
                    <h3 class="mf-section-title">&#128230; Детальная схема по слоям</h3>
                    <div class="mf-layers">
                        ${pallet.layers.map((layer, idx) => this._renderLayerCard(layer, idx, pallet.config)).join('')}
                    </div>
                </div>
                <div class="mf-footer-note">
                    &#9888; Перед погрузкой убедитесь, что каждая коробка установлена строго по схеме.
                    &darr;&uarr; = вдоль фюзеляжа &nbsp;&bull;&nbsp; &larr;&rarr; = поперёк фюзеляжа.
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    }

    // ═══════════════════════════════════════════════════════════════
    //  MANIFEST — LOWER DECK COMPARTMENT (визуальная схема)
    // ═══════════════════════════════════════════════════════════════
    showLowerDeckManifest(comp) {
        const totalBoxes = comp.items.reduce((a, i) => a + i.count, 0);
        const pct = Math.round((comp.weight / comp.max_weight) * 100);
        const hold = CONFIG.LOWER_DECK.find(h => h.compartments.some(c => c.id === comp.id)) || { door: { width: 140, height: 112 }, floor_width_cm: 120 };

        const modal = document.createElement('div');
        modal.className = 'mf-overlay';
        modal.innerHTML = `
            <div class="mf-modal">
                <div class="mf-header">
                    <div>
                        <h2 class="mf-title">&#128309; СХЕМА ПОГРУЗКИ &mdash; ${comp.name}</h2>
                        <div class="mf-header-badges">
                            <span class="mf-badge mf-badge-blue">&#9878; ${comp.weight.toLocaleString()} / ${comp.max_weight.toLocaleString()} кг (${pct}%)</span>
                            <span class="mf-badge mf-badge-green">&#128230; ${totalBoxes} коробок</span>
                            <span class="mf-badge mf-badge-gray">&#128208; ${comp.max_length_cm}&times;${hold.floor_width_cm}&times;${comp.max_height_cm} см</span>
                        </div>
                    </div>
                    <button class="mf-close" onclick="this.closest('.mf-overlay').remove()">&times;</button>
                </div>
                <div class="mf-orient-banner">
                    <div class="mf-orient-inner">
                        <span class="mf-nose">&#9668; ПЕРЕДНЯЯ СТЕНКА</span>
                        <div class="mf-fuselage-line"><span class="mf-fuselage-label">ОТСЕК</span></div>
                        <span class="mf-tail">ЗАДНЯЯ СТЕНКА &#9658;</span>
                    </div>
                    <p class="mf-orient-hint">Люк: <strong>${hold.door.width}&times;${hold.door.height} см</strong>. Коробки загружаются снизу через люк и задвигаются вдоль фюзеляжа.</p>
                </div>
                <div class="mf-section">
                    <h3 class="mf-section-title">&#128208; Схема укладки (вид сверху)</h3>
                    ${this._renderLowerDeckTopView(comp, hold)}
                </div>
                <div class="mf-section">
                    <h3 class="mf-section-title">&#128203; Содержимое отсека</h3>
                    <div class="mf-comp-items">
                        ${comp.items.map(item => this._renderCompItemCard(item, comp, hold)).join('')}
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    }

    // ─── SVG: вид сбоку (elevation) ──────────────────────────────
    _renderElevationSVG(pallet) {
        const W = 520, H = 200, PL = 38, PR = 12, PT = 12, PB = 28;
        const dW = W-PL-PR, dH = H-PT-PB;
        const sX = dW / pallet.config.width_long, sY = dH / pallet.config.max_height;
        const C = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899'];
        let rects = '';
        pallet.layers.forEach((layer, i) => {
            const col = C[i % C.length], ry = PT + dH - layer.z_end * sY, rh = layer.height * sY;
            rects += `<rect x="${PL}" y="${ry.toFixed(1)}" width="${dW}" height="${rh.toFixed(1)}" fill="${col}" opacity="0.82" rx="2"/>`;
            if (rh > 13) rects += `<text x="${(PL+dW/2).toFixed(1)}" y="${(ry+rh/2+4).toFixed(1)}" text-anchor="middle" font-size="10" fill="white" font-weight="bold">Слой ${i+1}: ${layer.count} шт. &bull; ${layer.height}см</text>`;
        });
        let grid = '';
        for (let v = 0; v <= pallet.config.max_height; v += 50) {
            const gy = PT + dH - v * sY;
            grid += `<line x1="${PL}" y1="${gy.toFixed(1)}" x2="${W-PR}" y2="${gy.toFixed(1)}" stroke="#1e3a5f" stroke-width="1"/>`;
            grid += `<text x="${PL-4}" y="${(gy+3).toFixed(1)}" text-anchor="end" font-size="9" fill="#64748b">${v}</text>`;
        }
        grid += `<line x1="${PL}" y1="${PT}" x2="${W-PR}" y2="${PT}" stroke="#ef4444" stroke-width="1" stroke-dasharray="5,3" opacity="0.7"/>`;
        grid += `<text x="${W-PR}" y="${PT-2}" text-anchor="end" font-size="8" fill="#ef4444">макс ${pallet.config.max_height}см</text>`;
        grid += `<rect x="${PL}" y="${PT+dH}" width="${dW}" height="4" fill="#475569" rx="1"/>`;
        grid += `<text x="${PL+dW/2}" y="${H-6}" text-anchor="middle" font-size="9" fill="#64748b">Вдоль фюзеляжа: ${pallet.config.width_long}см</text>`;
        grid += `<text x="${PL-18}" y="${PT+dH/2}" text-anchor="middle" font-size="9" fill="#64748b" transform="rotate(-90,${PL-18},${PT+dH/2})">Высота (см)</text>`;
        return `<div class="mf-svg-wrap"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="max-width:100%">${grid}${rects}</svg></div>`;
    }

    // ─── SVG: вид сверху одного слоя ─────────────────────────────
    _renderTopViewSVG(layer, config, color) {
        const SW = 340, SH = 210, PAD = 2, LH = 22, dH = SH - LH;
        const sX = (SW-PAD*2) / config.length_cross, sY = (dH-PAD*2) / config.width_long;
        const dC = layer.dim_cross || 100, dL = layer.dim_long || 80;
        const mC = layer.meta?.main?.r || 0, mR = layer.meta?.main?.c || 0, side = layer.meta?.side;
        let boxes = '';
        for (let r = 0; r < mR; r++) for (let c = 0; c < mC; c++) {
            const bx = PAD+c*dC*sX, by = PAD+r*dL*sY, bw = Math.max(2,dC*sX-1.5), bh = Math.max(2,dL*sY-1.5);
            boxes += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${color}" opacity="0.82" rx="2" stroke="white" stroke-width="0.5"/>`;
            if (bw>20&&bh>16) boxes += `<text x="${(bx+bw/2).toFixed(1)}" y="${(by+bh/2+4).toFixed(1)}" text-anchor="middle" font-size="10" fill="rgba(255,255,255,0.9)">&udarr;</text>`;
        }
        if (side?.count > 0) {
            const ox = PAD+mC*dC*sX+3, sdC = dL, sdL = dC;
            for (let r = 0; r < side.c; r++) for (let c = 0; c < side.r; c++) {
                const bx = ox+c*sdC*sX, by = PAD+r*sdL*sY, bw = Math.max(2,sdC*sX-1.5), bh = Math.max(2,sdL*sY-1.5);
                boxes += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="#f59e0b" opacity="0.85" rx="2" stroke="white" stroke-width="0.5"/>`;
                if (bw>16&&bh>14) boxes += `<text x="${(bx+bw/2).toFixed(1)}" y="${(by+bh/2+4).toFixed(1)}" text-anchor="middle" font-size="10" fill="rgba(255,255,255,0.9)">&harr;</text>`;
            }
        }
        const outline = `<rect x="1" y="1" width="${SW-2}" height="${dH-2}" fill="none" stroke="#475569" stroke-width="1.5" rx="3" stroke-dasharray="5,3"/>`;
        const ax = `<text x="${SW/2}" y="${dH+14}" text-anchor="middle" font-size="8" fill="#64748b">&larr; ПОПЕРЁК ФЮЗЕЛЯЖА (${config.length_cross}см) &rarr;</text>`;
        const lY = dH+2;
        const leg = `<rect x="2" y="${lY}" width="9" height="9" fill="${color}" rx="1"/><text x="14" y="${lY+8}" font-size="7.5" fill="#94a3b8">Обычно (&uarr;&darr; вдоль)</text>`
            + (side ? `<rect x="110" y="${lY}" width="9" height="9" fill="#f59e0b" rx="1"/><text x="122" y="${lY+8}" font-size="7.5" fill="#94a3b8">Повёрнуто 90&deg; (&harr;)</text>` : '');
        return `<div class="mf-svg-wrap"><svg width="${SW}" height="${SH}" viewBox="0 0 ${SW} ${SH}" style="max-width:100%">${outline}${boxes}${ax}${leg}</svg></div>`;
    }

    // ─── Карточка одного слоя ─────────────────────────────────────
    _renderLayerCard(layer, idx, config) {
        const C = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899'];
        const col = C[idx % C.length];
        const dC = layer.dim_cross||'?', dL = layer.dim_long||'?';
        const mC = layer.meta?.main?.r||0, mR = layer.meta?.main?.c||0, side = layer.meta?.side;
        const instr = layer.orient_type === 'A'
            ? `Класть коробку <strong style="color:#f59e0b">длинной стороной (${dC}см) ПОПЕРЁК самолёта</strong> &mdash; длина уходит влево-вправо.`
            : `Класть коробку <strong style="color:#f59e0b">короткой стороной (${dC}см) ПОПЕРЁК самолёта</strong>, длинная сторона (${dL}см) идёт вдоль нос-хвост.`;
        return `
        <div class="mf-layer-card" style="border-left:4px solid ${col}">
            <div class="mf-layer-header">
                <div class="mf-layer-num" style="background:${col}20;color:${col};border:1px solid ${col}40">СЛОЙ ${idx+1}</div>
                <div class="mf-layer-meta">
                    <span class="mf-badge-sm" style="background:#1e3a5f;color:#7dd3fc">&#128230; ${layer.count} кор.</span>
                    <span class="mf-badge-sm" style="background:#14362e;color:#6ee7b7">&#9878; ${(layer.count*(layer.weight||0)).toLocaleString()} кг</span>
                    <span class="mf-badge-sm" style="background:#2d1f3d;color:#c4b5fd">${layer.z_start}&ndash;${layer.z_end}см</span>
                    <span class="mf-badge-sm" style="background:#332b00;color:#fcd34d">Выс: ${layer.height}см</span>
                </div>
            </div>
            <div class="mf-layer-body">
                <div class="mf-topview-wrap">
                    <div class="mf-topview-ylabel"><span>&uarr;</span><span style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:9px;color:#64748b">ВДОЛЬ</span><span>&darr;</span></div>
                    ${this._renderTopViewSVG(layer, config, col)}
                </div>
                <div class="mf-instructions">
                    <div class="mf-instr-callout">
                        <div class="mf-instr-callout-icon">${layer.orient_type==='A'?'&harr;':'&udarr;'}</div>
                        <div>
                            <div class="mf-instr-callout-title">КАК СТАВИТЬ КОРОБКУ</div>
                            <p style="margin:0.3rem 0 0;line-height:1.5">${instr}</p>
                        </div>
                    </div>
                    <table class="mf-spec-table">
                        <tr><td>Название</td><td><strong>${layer.box_name||'—'}</strong></td></tr>
                        <tr><td>Размер (попер&times;вдоль&times;выс)</td><td><strong>${dC}&times;${dL}&times;${layer.height}см</strong></td></tr>
                        <tr><td>Колонны поперёк</td><td>${mC} шт. &times; ${dC}см = <strong>${(mC * +dC).toFixed(0)}см</strong></td></tr>
                        <tr><td>Ряды вдоль</td><td>${mR} шт. &times; ${dL}см = <strong>${(mR * +dL).toFixed(0)}см</strong></td></tr>
                        ${side?`<tr class="mf-side-row"><td>+ Повёрнутые 90&deg;</td><td>${side.count} шт. &mdash; <span style="color:#f59e0b">жёлтые на схеме</span></td></tr>`:''}
                    </table>
                    ${side?`<div class="mf-side-note">&#9888; Жёлтые коробки повёрнуты: ${dL}см поперёк, ${dC}см вдоль.</div>`:''}
                </div>
            </div>
        </div>`;
    }

    // ─── SVG: нижняя палуба вид сверху ───────────────────────────
    _renderLowerDeckTopView(comp, hold) {
        const W=460, H=170, PAD=4, LAB=28, cL=comp.max_length_cm, cW=hold.floor_width_cm||120;
        const sX=(W-LAB-PAD*2)/cL, sY=(H-PAD*2-20)/cW, oX=LAB+PAD, oY=PAD;
        const cw=cL*sX, ch=cW*sY;
        let c = `<rect x="${oX}" y="${oY}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" fill="#0f172a" stroke="#334155" stroke-width="1.5" rx="3"/>`;
        if (comp.obstacles) comp.obstacles.forEach(obs => {
            const ox=oX+(cL-obs.l)*sX, ow=obs.l*sX, oh=Math.min(obs.w*sY,ch);
            c += `<rect x="${ox.toFixed(1)}" y="${oY}" width="${ow.toFixed(1)}" height="${oh.toFixed(1)}" fill="#ef4444" opacity="0.3" rx="2" stroke="#ef4444" stroke-width="1"/>`;
            if (ow>25) c += `<text x="${(ox+ow/2).toFixed(1)}" y="${(oY+oh/2+4).toFixed(1)}" text-anchor="middle" font-size="8" fill="#ef4444" font-weight="bold">ПРЕПЯТСТВИЕ</text>`;
        });
        const CS=['#3b82f6','#10b981','#f59e0b','#8b5cf6']; let curX=0;
        comp.items.forEach((item,ci) => {
            const col=CS[ci%CS.length], iL=item.l||100, iW=item.w||80, rows=Math.max(1,Math.floor(cW/iW));
            let placed=0;
            while (placed<item.count && curX+iL<=cL) {
                for (let r=0; r<rows&&placed<item.count; r++) {
                    const bx=oX+curX*sX, by=oY+r*iW*sY, bw=Math.max(1,iL*sX-1.5), bh=Math.max(1,iW*sY-1.5);
                    c += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${col}" opacity="0.8" rx="2"/>`;
                    placed++;
                }
                curX+=iL;
            }
        });
        c += `<rect x="${oX}" y="${oY}" width="5" height="${ch.toFixed(1)}" fill="#22c55e" opacity="0.7" rx="1"/>`;
        c += `<text x="${(oX+3).toFixed(1)}" y="${oY-3}" text-anchor="middle" font-size="7" fill="#22c55e">&#9660;ЛЮК</text>`;
        c += `<text x="${(oX+cw/2).toFixed(1)}" y="${H-3}" text-anchor="middle" font-size="8" fill="#64748b">Длина: ${cL}см</text>`;
        c += `<text x="${(LAB/2).toFixed(1)}" y="${(oY+ch/2).toFixed(1)}" text-anchor="middle" font-size="8" fill="#64748b" transform="rotate(-90,${LAB/2},${oY+ch/2})">Шир: ${cW}см</text>`;
        return `<div class="mf-svg-wrap"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="max-width:100%">${c}</svg></div>`;
    }

    // ─── Карточка предмета нижней палубы ─────────────────────────
    _renderCompItemCard(item, comp, hold) {
        const CS=['#3b82f6','#10b981','#f59e0b','#8b5cf6'];
        const col = CS[comp.items.indexOf(item) % CS.length];
        const fits = (item.h<=hold.door.height) && (Math.min(item.l||0,item.w||0)<=hold.door.width);
        return `
        <div class="mf-comp-card" style="border-left:4px solid ${col}">
            <div class="mf-comp-card-header">
                <span style="color:${col};font-weight:700">&#128230; ${item.name}</span>
                <span class="mf-badge-sm" style="background:#1e293b">${item.count} шт.</span>
            </div>
            <table class="mf-spec-table" style="margin-top:0.5rem">
                <tr><td>Размер (Д&times;Ш&times;В)</td><td><strong>${item.l}&times;${item.w}&times;${item.h}см</strong></td></tr>
                <tr><td>Через люк (${hold.door.width}&times;${hold.door.height}см)</td><td style="color:${fits?'#22c55e':'#ef4444'};font-weight:bold">${fits?'&#10003; Проходит':'&#10007; Не проходит'}</td></tr>
                <tr><td>Как загружать</td><td>Плашмя (выс. ${item.h}см), задвигать вдоль фюзеляжа до упора</td></tr>
            </table>
        </div>`;
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


    // ─── PASTE FROM EXCEL ────────────────────────────────────────
    _parsePasteText(text) {
        const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) return [];
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
            name:   findCol(['description of goods', 'description', 'item name', 'name', 'batch', 'box', 'cargo']),
            qty:    findCol(['total cartoon', 'total carton', 'qty', 'quantity', 'cartons', 'ctns', 'count', 'pcs', 'units']),
            weight: findCol(['gross weight', 'weight per carton', 'weight', 'gross wt', 'kg', 'wt', 'kgs']),
            size:   findCol(['size of per carton', 'size per carton', 'size', 'dimensions', 'meas', 'l x w x h']),
            length: findCol(['l cm', 'd cm', 'length', 'l (cm)', 'l']),
            width:  findCol(['w cm', 'width', 'w (cm)', 'w']),
            height: findCol(['h cm', 'height', 'h (cm)', 'h']),
        };

        const parseNum = (v) => { if (v === undefined || v === null) return NaN; return parseFloat(String(v).replace(/[^\d.\-]/g, '')); };

        const parseDims = (sizeStr) => {
            if (!sizeStr) return null;
            const m = String(sizeStr).match(/([\d.]+)\s*[xX*×]\s*([\d.]+)\s*[xX*×]\s*([\d.]+)/);
            if (m) return { l: parseFloat(m[1]), w: parseFloat(m[2]), h: parseFloat(m[3]) };
            return null;
        };

        const results = [];
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.every(c => !c)) continue;
            const name = cols.name >= 0 ? (row[cols.name] || '') : `Item ${i}`;
            if (!name.trim()) continue;
            const qty = cols.qty >= 0 ? parseNum(row[cols.qty]) : NaN;
            const weight = cols.weight >= 0 ? parseNum(row[cols.weight]) : NaN;
            let l = cols.length >= 0 ? parseNum(row[cols.length]) : NaN;
            let w = cols.width  >= 0 ? parseNum(row[cols.width])  : NaN;
            let h = cols.height >= 0 ? parseNum(row[cols.height]) : NaN;
            if ((isNaN(l) || isNaN(w) || isNaN(h)) && cols.size >= 0) {
                const dims = parseDims(row[cols.size]);
                if (dims) { l = dims.l; w = dims.w; h = dims.h; }
            }
            if (!name || isNaN(qty) || qty <= 0) continue;
            results.push({
                name: name.trim(),
                qty: Math.round(qty),
                weight: isNaN(weight) ? 10 : weight,
                l: isNaN(l) ? 60 : l,
                w: isNaN(w) ? 40 : w,
                h: isNaN(h) ? 40 : h,
            });
        }
        return results;
    }

    previewPastedExcel() {
        const text = document.getElementById('paste-area').value;
        const preview = document.getElementById('paste-preview');
        if (!text.trim()) { preview.innerHTML = ''; return; }
        const items = this._parsePasteText(text);
        if (!items.length) { preview.innerHTML = '<span style="color:var(--danger)">Не удалось распознать данные. Проверьте заголовки таблицы.</span>'; return; }
        preview.innerHTML = `<span style="color:var(--success)">&#10003; Найдено ${items.length} позиций: </span>`
            + items.slice(0, 3).map(i => `<strong>${i.name}</strong> &times;${i.qty}`).join(', ')
            + (items.length > 3 ? ` и ещё ${items.length - 3}...` : '');
    }

    importPastedExcel() {
        const text = document.getElementById('paste-area').value;
        const items = this._parsePasteText(text);
        if (!items.length) { this.showToast('Не удалось разобрать данные из буфера.', 'error'); return; }
        items.forEach(item => {
            this.cargo.push({
                id: Date.now() + Math.random(),
                name: item.name,
                length: item.l, width: item.w, height: item.h,
                weight: item.weight, count: item.qty,
                allowTipping: false, noStack: false, priority: false,
                mainDeckOnly: false, lowerDeckOnly: false
            });
        });
        this.renderInventory();
        this.showToast(`Добавлено ${items.length} позиций из Excel`, 'success');
    }

    handleExcelImport(e) {
        const file = e.target.files[0];
        if (!file) return;
        this.showImportStatus('Загрузка файла...', 'loading');
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = new Uint8Array(evt.target.result);
                // SheetJS / xlsx expected to be loaded globally
                if (typeof XLSX === 'undefined') {
                    this.showImportStatus('Библиотека XLSX не загружена.', 'error'); return;
                }
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
                const items = this._parsePasteText(rows.map(r => r.join('\t')).join('\n'));
                if (!items.length) { this.showImportStatus('Не удалось найти данные в файле.', 'error'); return; }
                items.forEach(item => {
                    this.cargo.push({
                        id: Date.now() + Math.random(),
                        name: item.name,
                        length: item.l, width: item.w, height: item.h,
                        weight: item.weight, count: item.qty,
                        allowTipping: false, noStack: false, priority: false,
                        mainDeckOnly: false, lowerDeckOnly: false
                    });
                });
                this.renderInventory();
                this.showImportStatus(`&#10003; Импортировано ${items.length} позиций`, 'success');
            } catch (err) {
                this.showImportStatus('Ошибка: ' + err.message, 'error');
            }
        };
        reader.readAsArrayBuffer(file);
        e.target.value = '';
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.classList.add('toast-visible'), 10);
        setTimeout(() => { toast.classList.remove('toast-visible'); setTimeout(() => toast.remove(), 400); }, 3000);
    }
}

window.app = new CargoApp();
