/**
 * 批量去水印工具 - 主模块
 * 职责：UI 渲染、事件绑定、状态管理
 * 算法计算委托给 Web Worker (inpaint-worker.js)
 */

// ========== 全局状态 ==========
const state = {
    images: [],       // { id, name, imgEl, regions:[], status, processedDataUrl }
    dragging: null,   // { index, startX, startY }
};

const themes = {
    macaron1: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 50%, #d299c2 100%)',
    macaron2: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 50%, #ee9ca7 100%)',
    macaron3: 'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 50%, #e0c3fc 100%)',
    macaron4: 'linear-gradient(135deg, #d299c2 0%, #fef9d7 50%, #fbc2eb 100%)',
    macaron5: 'linear-gradient(135deg, #89f7fe 0%, #66a6ff 50%, #c3cfe2 100%)',
};

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('fileInput').addEventListener('change', handleFileSelect);

    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.body.style.background = themes[btn.dataset.theme];
            showToast('已切换背景主题');
        });
    });

    // 检查 jsPDF 是否加载成功
    if (typeof window.jspdf === 'undefined') {
        showToast('⚠️ PDF 库加载失败，导出 PDF 功能不可用，请检查网络或本地文件');
    }

    renderGrid();
});

// ========== 文件导入 ==========
function handleFileSelect(e) {
    try {
        const files = Array.from(e.target.files);
        if (!files.length) return;
        let loaded = 0;
        const total = files.filter(f => f.type.startsWith('image/')).length;
        if (total === 0) { showToast('⚠️ 未检测到有效的图片文件'); return; }

        files.forEach(file => {
            if (!file.type.startsWith('image/')) return;
            const reader = new FileReader();
            reader.onerror = () => showToast(`⚠️ 读取文件 ${file.name} 失败`);
            reader.onload = (ev) => {
                const img = new Image();
                img.onerror = () => showToast(`⚠️ 图片 ${file.name} 加载失败`);
                img.onload = () => {
                    state.images.push({
                        id: Date.now() + Math.random(),
                        name: file.name,
                        imgEl: img,
                        regions: [],
                        status: 'pending',
                        processedDataUrl: null,
                    });
                    loaded++;
                    if (loaded === total) {
                        renderGrid();
                        showToast(`✅ 已导入 ${total} 张图片`);
                    }
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    } catch (err) {
        showToast('⚠️ 导入图片时出错：' + err.message);
    }
}

// ========== 渲染图片网格 ==========
function renderGrid() {
    const grid = document.getElementById('imageGrid');
    if (!state.images.length) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1;">
                <div class="icon">📷</div>
                <h3>暂无图片</h3>
                <p>点击上方"导入图片"按钮添加需要去水印的图片</p>
            </div>`;
        return;
    }
    grid.innerHTML = '';
    state.images.forEach((img, i) => {
        const card = document.createElement('div');
        card.className = 'image-card';
        card.id = 'card-' + i;

        const wrapper = document.createElement('div');
        wrapper.className = 'canvas-wrapper';

        const canvas = document.createElement('canvas');
        canvas.id = 'canvas-' + i;
        const maxDisplayW = 500;
        const scale = Math.min(1, maxDisplayW / img.imgEl.width);
        canvas.width = img.imgEl.width;
        canvas.height = img.imgEl.height;
        canvas.style.width = Math.floor(img.imgEl.width * scale) + 'px';
        canvas.style.height = Math.floor(img.imgEl.height * scale) + 'px';

        drawCanvas(canvas, img);

        canvas.addEventListener('mousedown', (e) => onMouseDown(e, i));
        canvas.addEventListener('mousemove', (e) => onMouseMove(e, i));
        canvas.addEventListener('mouseup', (e) => onMouseUp(e, i));
        canvas.addEventListener('mouseleave', (e) => onMouseUp(e, i));

        const badge = document.createElement('span');
        badge.className = 'status-badge ' + img.status;
        badge.textContent = img.status === 'processed' ? '已处理' : '待处理';

        const regionBadge = document.createElement('span');
        regionBadge.className = 'region-count';
        regionBadge.textContent = `已选 ${img.regions.length} 个区域`;
        regionBadge.style.display = img.regions.length ? 'block' : 'none';

        wrapper.append(canvas, badge, regionBadge);

        const footer = document.createElement('div');
        footer.className = 'card-footer';
        footer.innerHTML = `
            <span class="card-name" title="${img.name}">${img.name}</span>
            <div class="card-actions">
                <button class="card-btn preview" onclick="previewImage(${i})" title="预览">👁️</button>
                <button class="card-btn process" onclick="processSingle(${i})" title="去水印">✨</button>
                <button class="card-btn download" onclick="downloadImage(${i})" title="下载">📥</button>
                <button class="card-btn remove-regions" onclick="clearRegions(${i})" title="清除选区">🔄</button>
                <button class="card-btn delete" onclick="deleteImage(${i})" title="删除">🗑️</button>
            </div>`;

        card.append(wrapper, footer);
        grid.appendChild(card);
    });
}

// ========== Canvas 绘制 ==========
function drawCanvas(canvas, imgData) {
    const ctx = canvas.getContext('2d');
    if (imgData.processedDataUrl) {
        const processed = new Image();
        processed.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(processed, 0, 0);
            drawRegions(ctx, imgData.regions);
        };
        processed.src = imgData.processedDataUrl;
    } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(imgData.imgEl, 0, 0);
        drawRegions(ctx, imgData.regions);
    }
}

function drawRegions(ctx, regions) {
    regions.forEach((r, i) => {
        ctx.save();
        ctx.strokeStyle = '#ff4757';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.fillStyle = 'rgba(255, 71, 87, 0.2)';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(235,51,73,0.8)';
        const badgeW = 22, badgeH = 18;
        ctx.beginPath();
        ctx.roundRect(r.x, r.y, badgeW, badgeH, 3);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(i + 1, r.x + 6, r.y + 13);
        ctx.restore();
    });
}

// ========== Canvas 鼠标框选 ==========
function getCanvasCoords(e, index) {
    const canvas = document.getElementById('canvas-' + index);
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left) * (canvas.width / rect.width),
        y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
}

function onMouseDown(e, index) {
    if (e.button !== 0) return;
    e.preventDefault();
    const coords = getCanvasCoords(e, index);
    state.dragging = { index, startX: coords.x, startY: coords.y };
}

function onMouseMove(e, index) {
    if (!state.dragging || state.dragging.index !== index) return;
    e.preventDefault();
    const coords = getCanvasCoords(e, index);
    const img = state.images[index];
    const canvas = document.getElementById('canvas-' + index);
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (img.processedDataUrl) {
        const p = new Image(); p.src = img.processedDataUrl;
        ctx.drawImage(p, 0, 0);
    } else {
        ctx.drawImage(img.imgEl, 0, 0);
    }
    drawRegions(ctx, img.regions);

    const rx = Math.min(state.dragging.startX, coords.x);
    const ry = Math.min(state.dragging.startY, coords.y);
    const rw = Math.abs(coords.x - state.dragging.startX);
    const rh = Math.abs(coords.y - state.dragging.startY);
    ctx.save();
    ctx.strokeStyle = '#ff4757';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.fillStyle = 'rgba(255, 71, 87, 0.15)';
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.restore();
}

function onMouseUp(e, index) {
    if (!state.dragging || state.dragging.index !== index) return;
    const coords = getCanvasCoords(e, index);
    const rx = Math.round(Math.min(state.dragging.startX, coords.x));
    const ry = Math.round(Math.min(state.dragging.startY, coords.y));
    const rw = Math.round(Math.abs(coords.x - state.dragging.startX));
    const rh = Math.round(Math.abs(coords.y - state.dragging.startY));
    state.dragging = null;

    if (rw > 10 && rh > 10) {
        const img = state.images[index];
        const cx = Math.max(0, rx);
        const cy = Math.max(0, ry);
        const cw = Math.min(rw, img.imgEl.width - cx);
        const ch = Math.min(rh, img.imgEl.height - cy);
        img.regions.push({ x: cx, y: cy, w: cw, h: ch });
        img.status = 'pending';
        img.processedDataUrl = null;
        showToast(`已添加第 ${img.regions.length} 个水印区域`);
    }
    const canvas = document.getElementById('canvas-' + index);
    if (canvas) drawCanvas(canvas, state.images[index]);
    updateBadges(index);
}

function updateBadges(index) {
    const card = document.getElementById('card-' + index);
    if (!card) return;
    const img = state.images[index];
    const rb = card.querySelector('.region-count');
    const sb = card.querySelector('.status-badge');
    rb.textContent = `已选 ${img.regions.length} 个区域`;
    rb.style.display = img.regions.length ? 'block' : 'none';
    sb.className = 'status-badge ' + img.status;
    sb.textContent = img.status === 'processed' ? '已处理' : '待处理';
}

// ========== Web Worker 处理 ==========
function runWorker(imgData, regions, algorithm) {
    return new Promise((resolve, reject) => {
        try {
            const worker = new Worker(new URL('./inpaint-worker.js', import.meta.url));
            worker.onmessage = (e) => {
                if (e.data.type === 'done') {
                    worker.terminate();
                    resolve(e.data.imageData);
                } else if (e.data.type === 'error') {
                    worker.terminate();
                    reject(new Error(e.data.message));
                }
            };
            worker.onerror = (err) => {
                worker.terminate();
                reject(new Error('Worker 执行出错: ' + err.message));
            };
            worker.postMessage({ imageData: imgData, regions, algorithm });
        } catch (err) {
            reject(err);
        }
    });
}

function showProcessingOverlay(index) {
    const card = document.getElementById('card-' + index);
    if (!card) return;
    const wrapper = card.querySelector('.canvas-wrapper');
    const overlay = document.createElement('div');
    overlay.className = 'processing-overlay';
    overlay.id = 'overlay-' + index;
    overlay.innerHTML = '<div class="processing-spinner"></div><div class="processing-text">正在处理中...</div>';
    wrapper.appendChild(overlay);
}

function hideProcessingOverlay(index) {
    const overlay = document.getElementById('overlay-' + index);
    if (overlay) overlay.remove();
}

// ========== 单张处理 ==========
async function processSingle(index) {
    const img = state.images[index];
    if (img.regions.length === 0) {
        showToast('⚠️ 请先在图片上框选水印区域');
        return;
    }

    const algo = document.getElementById('algorithmSelect').value;
    showToast(`🔄 正在使用 ${getAlgorithmName()} 处理...`);
    showProcessingOverlay(index);

    try {
        const canvas = document.createElement('canvas');
        canvas.width = img.imgEl.width;
        canvas.height = img.imgEl.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img.imgEl, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        const result = await runWorker(imageData, img.regions, algo);

        ctx.putImageData(result, 0, 0);
        img.processedDataUrl = canvas.toDataURL('image/png');
        img.status = 'processed';

        const displayCanvas = document.getElementById('canvas-' + index);
        if (displayCanvas) drawCanvas(displayCanvas, img);
        updateBadges(index);
        showToast('✅ 处理完成！水印已去除');
    } catch (err) {
        showToast('❌ 处理失败：' + err.message);
    } finally {
        hideProcessingOverlay(index);
    }
}

// ========== 批量处理 ==========
async function processAllImages() {
    const pending = state.images.filter(img => img.regions.length > 0 && img.status === 'pending');
    if (pending.length === 0) {
        showToast('⚠️ 没有需要处理的图片，请先框选水印区域');
        return;
    }

    const algo = document.getElementById('algorithmSelect').value;
    showToast(`🔄 正在使用 ${getAlgorithmName()} 处理 ${pending.length} 张图片...`);

    let done = 0;
    for (let i = 0; i < state.images.length; i++) {
        const img = state.images[i];
        if (img.regions.length === 0 || img.status === 'processed') continue;

        showProcessingOverlay(i);
        try {
            const canvas = document.createElement('canvas');
            canvas.width = img.imgEl.width;
            canvas.height = img.imgEl.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img.imgEl, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            const result = await runWorker(imageData, img.regions, algo);

            ctx.putImageData(result, 0, 0);
            img.processedDataUrl = canvas.toDataURL('image/png');
            img.status = 'processed';

            const displayCanvas = document.getElementById('canvas-' + i);
            if (displayCanvas) drawCanvas(displayCanvas, img);
            updateBadges(i);
            done++;
        } catch (err) {
            showToast(`❌ 第 ${i + 1} 张处理失败：${err.message}`);
        } finally {
            hideProcessingOverlay(i);
        }
    }

    showToast(`✅ 已完成 ${done} 张图片的去水印处理！`);
}

function getAlgorithmName() {
    const sel = document.getElementById('algorithmSelect');
    return sel.options[sel.selectedIndex].text;
}

// ========== 下载 ==========
function getOriginalDataUrl(img) {
    try {
        const c = document.createElement('canvas');
        c.width = img.imgEl.width;
        c.height = img.imgEl.height;
        c.getContext('2d').drawImage(img.imgEl, 0, 0);
        return c.toDataURL('image/png');
    } catch (err) {
        showToast('⚠️ 生成图片数据失败：' + err.message);
        return null;
    }
}

function downloadImage(index) {
    try {
        const img = state.images[index];
        const src = img.processedDataUrl || getOriginalDataUrl(img);
        if (!src) return;
        const link = document.createElement('a');
        link.download = '去水印_' + img.name;
        link.href = src;
        link.click();
        showToast('📥 开始下载 ' + img.name);
    } catch (err) {
        showToast('❌ 下载失败：' + err.message);
    }
}

async function downloadAll() {
    if (!state.images.length) { showToast('⚠️ 没有可下载的图片'); return; }
    if (typeof JSZip === 'undefined') {
        showToast('⚠️ ZIP 库未加载，逐张下载中...');
        state.images.forEach((_, i) => { setTimeout(() => downloadImage(i), i * 500); });
        return;
    }
    showToast('📦 正在打包下载...');
    try {
        const zip = new JSZip();
        for (let i = 0; i < state.images.length; i++) {
            const img = state.images[i];
            const src = img.processedDataUrl || getOriginalDataUrl(img);
            if (!src) continue;
            const base64 = src.split(',')[1];
            const baseName = img.name.replace(/\.[^.]+$/, '');
            zip.file(`去水印_${baseName}.png`, base64, { base64: true });
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = '去水印图片_批量下载.zip';
        link.click();
        URL.revokeObjectURL(link.href);
        showToast('✅ 批量下载完成');
    } catch (err) {
        showToast('❌ 打包失败：' + err.message);
    }
}

// ========== PDF 导出 ==========
async function exportToPDF() {
    if (!state.images.length) { showToast('⚠️ 没有可导出的图片'); return; }

    if (typeof window.jspdf === 'undefined') {
        showToast('❌ PDF 库未加载，无法导出。请检查 libs/jspdf.umd.min.js 是否存在');
        return;
    }

    showToast('📄 正在生成 PDF...');

    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pw = pdf.internal.pageSize.getWidth();
        const ph = pdf.internal.pageSize.getHeight();
        const margin = 10;

        for (let i = 0; i < state.images.length; i++) {
            if (i > 0) pdf.addPage();
            const img = state.images[i];
            const src = img.processedDataUrl || getOriginalDataUrl(img);
            if (!src) continue;
            const ratio = img.imgEl.width / img.imgEl.height;
            const maxW = pw - margin * 2, maxH = ph - margin * 2;
            let w, h;
            if (ratio > maxW / maxH) { w = maxW; h = w / ratio; }
            else { h = maxH; w = h * ratio; }
            pdf.addImage(src, 'PNG', (pw - w) / 2, (ph - h) / 2, w, h);
        }

        const now = new Date();
        const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
        const pdfName = `去水印图片_${state.images.length}张_${ts}.pdf`;
        pdf.save(pdfName);
        showToast('✅ PDF 导出成功！');
    } catch (err) {
        showToast('❌ PDF 导出失败：' + err.message);
    }
}

// ========== 辅助操作 ==========
function clearRegions(index) {
    state.images[index].regions = [];
    state.images[index].status = 'pending';
    state.images[index].processedDataUrl = null;
    const canvas = document.getElementById('canvas-' + index);
    if (canvas) drawCanvas(canvas, state.images[index]);
    updateBadges(index);
    showToast('已清除所有选区');
}

function deleteImage(index) {
    state.images.splice(index, 1);
    renderGrid();
    showToast('已删除图片');
}

function clearAll() {
    if (!state.images.length) return;
    if (confirm('确定要清空所有图片吗？')) {
        state.images = [];
        renderGrid();
        showToast('已清空全部图片');
    }
}

function previewImage(index) {
    try {
        const img = state.images[index];
        const src = img.processedDataUrl || getOriginalDataUrl(img);
        if (!src) return;
        document.getElementById('previewImage').src = src;
        document.getElementById('previewModal').classList.add('show');
    } catch (err) {
        showToast('⚠️ 预览失败：' + err.message);
    }
}

function closePreview() {
    document.getElementById('previewModal').classList.remove('show');
}

// ========== Toast ==========
let toastTimer = null;
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ========== 快捷键 & 事件 ==========
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePreview();
});

document.getElementById('previewModal').addEventListener('click', (e) => {
    if (e.target.id === 'previewModal') closePreview();
});

window.processAllImages = processAllImages;
window.downloadAll = downloadAll;
window.exportToPDF = exportToPDF;
window.clearAll = clearAll;
window.previewImage = previewImage;
window.processSingle = processSingle;
window.downloadImage = downloadImage;
window.clearRegions = clearRegions;
window.deleteImage = deleteImage;
window.closePreview = closePreview;
