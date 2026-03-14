import { Packer, CONFIG } from './packer.js?v=8';
import { MainDeckViz } from './ui_visualizer_main.js';
import { LowerDeckViz } from './ui_visualizer_3d.js?v=2.2';

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

        const headers = rows[0].map(h => String(h || '').trim().toLowerCase());
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
            name: getColIdx(['box', 'item name', 'name', 'description', 'batch', 'cargo', 'box #']),
            width: getColIdx(['w cm', 'width', 'w (cm)', 'breadth', 'w']),
            length: getColIdx(['d cm', 'l cm', 'length', 'l (cm)', 'depth', 'd', 'l']),
            height: getColIdx(['h cm', 'height', 'h (cm)', 'h']),
            weight: getColIdx(['kg', 'weight', 'wt', 'kgs', 'weight kg']),
            qty: getColIdx(['qty', 'quantity', 'count', 'units', 'pcs'])
        };

        console.log("Column Mapping:", colMapping);

        let importCount = 0;
        let skipCount = 0;

        dataRows.forEach((row, idx) => {
            // Skip empty rows
            if (!row || row.length === 0 || !row.some(cell => cell !== null && cell !== '')) {
                return;
            }

            const name = colMapping.name !== -1 ? String(row[colMapping.name] || `Item ${idx + 1}`) : `Item ${idx + 1}`;
            const l = colMapping.length !== -1 ? parseFloat(row[colMapping.length]) : NaN;
            const w = colMapping.width !== -1 ? parseFloat(row[colMapping.width]) : NaN;
            const h = colMapping.height !== -1 ? parseFloat(row[colMapping.height]) : NaN;
            const wt = colMapping.weight !== -1 ? parseFloat(row[colMapping.weight]) : NaN;
            const qty = colMapping.qty !== -1 ? parseInt(row[colMapping.qty]) || 1 : 1;

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
                allowTipping: true,
                noStack: false,
                priority: false,
                mainDeckOnly: false
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

        document.getElementById(tabId).classList.add('active');
        document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');

        this.currentTab = tabId;

        // Update Title
        const titles = {
            'input-tab': { h1: 'Cargo Inventory', p: 'Define batch dimensions and quantities' },
            'main-deck-tab': { h1: 'Main Deck Plan', p: '3D Visualization of Upper Deck Pallets' },
            'lower-deck-tab': { h1: 'Lower Deck Plan', p: 'Hold utilization and bulk cargo layout' },
            'summary-tab': { h1: 'Load Summary', p: 'Final payload distribution and reports' }
        };
        document.getElementById('tab-title').textContent = titles[tabId].h1;
        document.getElementById('tab-subtitle').textContent = titles[tabId].p;

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
            mainDeckOnly
        });
        this.renderInventory();

        // Reset form
        document.getElementById('item-name').value = '';
        document.getElementById('item-priority').checked = false;
        document.getElementById('main-deck-only').checked = false;
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
        } catch (e) {
            console.error("Packer Error:", e);
            alert("Calculation Error: " + e.message);
            return;
        }

        console.log("Pack Results:", this.results);

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
            <div style="margin-bottom: 10px; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
                <small style="color:var(--text-muted); display:block; margin-bottom:4px;">REQUESTED LOAD</small>
                <span style="color:${netColor}; font-weight:bold;">Net: ${requestedNet.toLocaleString()} / ${maxNetCapability.toLocaleString()} kg</span>
                ${isNetOverload ? '<br><small style="color:#ef4444;"><i class="fas fa-exclamation-triangle"></i> Structural Limit Exceeded</small>' : ''}
            </div>
            <div style="margin-bottom: 10px;">
                <small style="color:var(--text-muted); display:block; margin-bottom:4px;">ACTUAL LOADED (ZFW)</small>
                Net: ${totalW.toLocaleString()} kg<br>
                <span style="font-size:0.85em; color:${limitColor}; font-weight:bold;">Gross: ${totalGross.toLocaleString()} / ${maxLimit.toLocaleString()} kg (${loadPercentage}%)</span>
            </div>
            <div style="font-size:0.8em; color:var(--text-muted);">
                Vol: ${totalVolume.toFixed(2)} m³ | Tare: ${totalTare.toLocaleString()} kg
            </div>
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
        document.getElementById('md-pos').textContent = `${this.results.pallets.filter(p => p.currentWeight > 0).length}/${CONFIG.PALLET_OPTIONS[configCode].count}`;

        const leftoversCount = this.results.leftovers.reduce((acc, i) => acc + i.count, 0);
        document.getElementById('total-leftovers').textContent = leftoversCount;

        const leftoverCard = document.getElementById('leftover-card');
        const leftoverList = document.getElementById('leftover-list');
        leftoverList.innerHTML = '';

        if (leftoversCount > 0) {
            leftoverCard.classList.add('error-card');
            this.results.leftovers.forEach(item => {
                const div = document.createElement('div');
                div.className = 'leftover-item';
                div.style.padding = '0.5rem';
                div.style.borderBottom = '1px solid var(--border)';
                div.innerHTML = `<strong>${item.name}</strong>: ${item.count} units - Could not fit (Limit or Space)`;
                leftoverList.appendChild(div);
            });
        } else {
            leftoverCard.classList.remove('error-card');
        }

        // Render Report
        this.renderReport();

        // Show Success
        this.switchTab('summary-tab');
    }

    renderReport() {
        const container = document.getElementById('position-report');
        container.innerHTML = '';

        // Main Deck
        this.results.pallets.forEach(p => {
            if (p.currentWeight === 0) return;
            const palletBoxes = p.layers.reduce((acc, l) => acc + l.count, 0);
            const item = document.createElement('div');
            item.className = 'report-item';
            item.innerHTML = `
                <span><strong>Pos ${p.id} (${p.config.code})</strong> - ${palletBoxes} boxes</span>
                <span>${p.currentWeight.toLocaleString()} / ${p.maxNetWeight.toLocaleString()} kg</span>
            `;
            container.appendChild(item);

            // Add Details Button
            const btn = document.createElement('button');
            btn.className = 'btn-sm btn-secondary';
            btn.innerHTML = '<i class="fas fa-list"></i> View Manifest';
            btn.style.marginTop = '0.5rem';
            btn.onclick = () => this.showPalletManifest(p);
            item.appendChild(btn);
        });

        // Lower Deck
        this.results.lowerDeck.forEach(hold => {
            hold.compartments.forEach(comp => {
                const compBoxes = comp.items.reduce((acc, i) => acc + i.count, 0);
                if (compBoxes === 0) return;
                const item = document.createElement('div');
                item.className = 'report-item';
                item.innerHTML = `
                    <span><strong>${comp.name}</strong> - ${compBoxes} boxes</span>
                    <span>${comp.weight.toLocaleString()} kg</span>
                `;
                container.appendChild(item);

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
        let text = `<h3>Pallet ${pallet.id} (${pallet.config.code}) Manifest</h3>`;
        text += `<p>Total Weight: ${pallet.currentWeight} kg</p>`;
        text += `<div class="manifest-list">`;

        let cumulativeHeight = 0;
        pallet.layers.forEach((l, idx) => {
            cumulativeHeight += l.height;
            text += `<div class="manifest-layer">
                <strong>Layer ${idx + 1}</strong> (Height: ${l.height}cm | Total: ${cumulativeHeight}cm)<br>
                ${l.count} x ${l.box_name} <br>`;

            // Add metadata details if available
            if (l.meta && l.meta.main) {
                text += `<small>Main Block: ${l.meta.main.c} rows x ${l.meta.main.r} cols</small>`;
            }
            if (l.meta && l.meta.side) {
                text += `<br><small>Side Block: ${l.meta.side.c} rows x ${l.meta.side.r} cols (Rotated)</small>`;
            }
            text += `</div>`;
        });
        text += `</div>`;

        this.showModal(text);
    }

    showLowerDeckManifest(comp) {
        let text = `<h3>Compartment ${comp.id} (${comp.name}) Manifest</h3>`;
        text += `<p>Total Weight: ${comp.weight.toLocaleString()} kg</p>`;
        text += `<div class="manifest-list">`;

        comp.items.forEach((item, idx) => {
            text += `<div class="manifest-layer">
                <strong>Batch ${idx + 1}: ${item.name}</strong><br>
                Qty: ${item.count} | Dims: ${item.l}x${item.w}x${item.h} cm<br>
                Weight: ${item.weight ? item.weight.toLocaleString() + ' kg' : 'N/A'}
            </div>`;
        });
        text += `</div>`;

        this.showModal(text);
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
            let activePallets = this.results.pallets.filter(p => p.currentWeight > 0);

            // Random shuffle of active pallets into available positions
            let positions = Array.from({ length: CONFIG.PALLET_OPTIONS[configCode].count }, (_, i) => i);
            this.shuffleArray(positions);

            let newPallets = Array.from({ length: CONFIG.PALLET_OPTIONS[configCode].count }, (_, i) => ({
                id: i + 1,
                config: CONFIG.PALLET_OPTIONS[configCode],
                layers: [],
                currentWeight: 0,
                tareWeight: CONFIG.PALLET_OPTIONS[configCode].tare_weight,
                maxNetWeight: CONFIG.PALLET_OPTIONS[configCode].max_weight - CONFIG.PALLET_OPTIONS[configCode].tare_weight
            }));

            activePallets.forEach((p, idx) => {
                const targetIdx = positions[idx];
                newPallets[targetIdx] = { ...p, id: targetIdx + 1 };
            });

            this.results.pallets = newPallets;
            this.calculate(); // Recalculate totals
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
