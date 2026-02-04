import { Packer, CONFIG } from './packer.js?v=2';
import { MainDeckViz } from './ui_visualizer_main.js';
import { LowerDeckViz } from './ui_visualizer_3d.js';

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

        // Calculate
        document.getElementById('btn-calculate').addEventListener('click', () => this.calculate());

        // Initial render
        this.renderInventory();
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

        if (isNaN(l) || isNaN(w) || isNaN(h) || isNaN(wt) || isNaN(qty)) {
            alert("Please enter valid numbers");
            return;
        }

        this.cargo.push({ id: Date.now(), name, length: l, width: w, height: h, weight: wt, count: qty, allowTipping: tip, noStack });
        this.renderInventory();

        // Reset form
        document.getElementById('item-name').value = '';
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
            tr.innerHTML = `
                <td>${item.name}</td>
                <td>${item.length}x${item.width}x${item.height}</td>
                <td>${item.weight} kg</td>
                <td>${item.count} ${item.noStack ? '<span class="badge" style="background:#ef4444; color:white; padding:2px 4px; border-radius:4px; font-size:0.7em;">Top Only</span>' : ''}</td>
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
        const configCode = document.getElementById('config-select').value;
        this.results = Packer.packAircraft(configCode, this.cargo);

        // Update Summary Stats
        // NET Weight
        const totalW = this.results.pallets.reduce((acc, p) => acc + p.currentWeight, 0) +
            this.results.lowerDeck.reduce((acc, h) => acc + h.current_weight, 0);

        // GROSS Weight (Net + Tare) & Volume
        let totalGross = this.results.lowerDeck.reduce((acc, h) => acc + h.current_weight, 0); // Holds have no tare in this logic? Assume 0 for holds.
        let totalVolume = 0;

        // Pallets Gross = Net + Tare
        this.results.pallets.forEach(p => {
            // If used (weight > 0), add tare
            if (p.currentWeight > 0) totalGross += (p.currentWeight + p.tareWeight);

            // Volume
            p.layers.forEach(l => {
                // volume = l.count * (box volume)
                // We don't have box volume directly in layer, but we can approximate:
                // l.dim_cross * l.dim_long * l.height * l.count
                // NOTE: dimensions are cm. -> / 1,000,000 for m3
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

        document.getElementById('total-weight').innerHTML = `
            Net: ${totalW.toLocaleString()} kg<br>
            <span style="font-size:0.8em; color:var(--accent);">Gross: ${totalGross.toLocaleString()} kg</span><br>
            <span style="font-size:0.8em; color:var(--text-muted);">Vol: ${totalVolume.toFixed(2)} m³</span>
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
        if (leftoversCount > 0) leftoverCard.classList.add('error-card');
        else leftoverCard.classList.remove('error-card');

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

        pallet.layers.forEach((l, idx) => {
            text += `<div class="manifest-layer">
                <strong>Layer ${idx + 1}</strong> (Height: ${l.height}cm)<br>
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

        // Simple Modal Implementation
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-card">
                <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                ${text}
            </div>
        `;
        document.body.appendChild(modal);
    }
}

window.app = new CargoApp();
