/**
 * 去水印算法 Web Worker
 * 在后台线程执行计算密集型的图像修复算法，避免阻塞主线程 UI
 *
 * 消息格式:
 *   输入: { imageData: ImageData, regions: [{x,y,w,h}], algorithm: string }
 *   输出: { type: 'done', imageData: ImageData }
 *        { type: 'progress', percent: number }
 *        { type: 'error', message: string }
 */

self.onmessage = function (e) {
    try {
        const { imageData, regions, algorithm } = e.data;
        const d = imageData.data;
        const imgW = imageData.width;
        const imgH = imageData.height;

        for (let ri = 0; ri < regions.length; ri++) {
            const r = regions[ri];
            const x = Math.max(0, Math.round(r.x));
            const y = Math.max(0, Math.round(r.y));
            const w = Math.min(Math.round(r.w), imgW - x);
            const h = Math.min(Math.round(r.h), imgH - y);

            if (w <= 0 || h <= 0) continue;

            switch (algorithm) {
                case 'telea':  telea(d, x, y, w, h, imgW, imgH); break;
                case 'ns':     ns(d, x, y, w, h, imgW, imgH); break;
                case 'gaussian': gaussian(d, x, y, w, h, imgW, imgH); break;
                case 'average':  average(d, x, y, w, h, imgW, imgH); break;
                default: telea(d, x, y, w, h, imgW, imgH);
            }

            self.postMessage({
                type: 'progress',
                percent: Math.round(((ri + 1) / regions.length) * 100)
            });
        }

        self.postMessage({ type: 'done', imageData });
    } catch (err) {
        self.postMessage({ type: 'error', message: err.message || '算法执行出错' });
    }
};

// ========== Telea 快速行进修复算法 ==========
function telea(d, x, y, w, h, imgW, imgH) {
    const radius = 8;
    const mask = new Uint8Array(imgW * imgH);
    for (let py = y; py < y + h; py++)
        for (let px = x; px < x + w; px++)
            mask[py * imgW + px] = 1;

    // BFS 从边界向内修复
    const queue = [];
    for (let py = y; py < y + h; py++) {
        for (let px = x; px < x + w; px++) {
            for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
                const nx = px + dx, ny = py + dy;
                if (nx >= 0 && nx < imgW && ny >= 0 && ny < imgH && mask[ny * imgW + nx] === 0) {
                    queue.push([px, py]);
                    break;
                }
            }
        }
    }

    const processed = new Set();
    while (queue.length > 0) {
        const [cx, cy] = queue.shift();
        const key = cy * imgW + cx;
        if (processed.has(key) || mask[key] === 0) continue;
        processed.add(key);

        let sumR = 0, sumG = 0, sumB = 0, sumW = 0;
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const nx = cx + dx, ny = cy + dy;
                if (nx < 0 || nx >= imgW || ny < 0 || ny >= imgH) continue;
                if (mask[ny * imgW + nx] === 1) continue;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > radius) continue;
                const wt = 1 / (1 + dist * dist);
                const pi = (ny * imgW + nx) * 4;
                sumR += d[pi] * wt; sumG += d[pi+1] * wt; sumB += d[pi+2] * wt; sumW += wt;
            }
        }
        if (sumW > 0) {
            const pi = key * 4;
            d[pi] = Math.round(sumR / sumW);
            d[pi+1] = Math.round(sumG / sumW);
            d[pi+2] = Math.round(sumB / sumW);
        }
        mask[key] = 0;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx >= 0 && nx < imgW && ny >= 0 && ny < imgH && mask[ny * imgW + nx] === 1)
                queue.push([nx, ny]);
        }
    }
}

// ========== NS 扩散修复算法 ==========
function ns(d, x, y, w, h, imgW, imgH) {
    const iterations = 80;
    const mask = new Uint8Array(imgW * imgH);
    for (let py = y; py < y + h; py++)
        for (let px = x; px < x + w; px++)
            mask[py * imgW + px] = 1;

    for (let iter = 0; iter < iterations; iter++) {
        for (let py = y; py < y + h; py++) {
            for (let px = x; px < x + w; px++) {
                if (mask[py * imgW + px] === 0) continue;
                let sR = 0, sG = 0, sB = 0, cnt = 0;
                for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) {
                    const nx = px + dx, ny = py + dy;
                    if (nx < 0 || nx >= imgW || ny < 0 || ny >= imgH) continue;
                    const ni = (ny * imgW + nx) * 4;
                    sR += d[ni]; sG += d[ni+1]; sB += d[ni+2]; cnt++;
                }
                if (cnt > 0) {
                    const pi = (py * imgW + px) * 4;
                    d[pi] = Math.round(sR / cnt);
                    d[pi+1] = Math.round(sG / cnt);
                    d[pi+2] = Math.round(sB / cnt);
                }
            }
        }
    }
}

// ========== 高斯模糊填充 ==========
function gaussian(d, x, y, w, h, imgW, imgH) {
    const orig = new Uint8ClampedArray(d);
    fillBorder(d, orig, x, y, w, h, imgW, imgH);
    const r = 8, sigma = r / 3;
    for (let py = y; py < y + h; py++) {
        for (let px = x; px < x + w; px++) {
            let sR = 0, sG = 0, sB = 0, sW = 0;
            for (let ky = -r; ky <= r; ky++) {
                for (let kx = -r; kx <= r; kx++) {
                    const nx = px + kx, ny = py + ky;
                    if (nx < 0 || nx >= imgW || ny < 0 || ny >= imgH) continue;
                    const wt = Math.exp(-(kx*kx + ky*ky) / (2*sigma*sigma));
                    const ni = (ny * imgW + nx) * 4;
                    sR += d[ni]*wt; sG += d[ni+1]*wt; sB += d[ni+2]*wt; sW += wt;
                }
            }
            const pi = (py * imgW + px) * 4;
            d[pi] = Math.round(sR/sW); d[pi+1] = Math.round(sG/sW); d[pi+2] = Math.round(sB/sW);
        }
    }
}

// ========== 周围像素平均 ==========
function average(d, x, y, w, h, imgW, imgH) {
    const orig = new Uint8ClampedArray(d);
    const sampleR = Math.max(5, Math.min(20, w/4, h/4));
    for (let py = y; py < y + h; py++) {
        for (let px = x; px < x + w; px++) {
            const dL = px-x, dR = (x+w-1)-px, dT = py-y, dB = (y+h-1)-py;
            let sR=0, sG=0, sB=0, sW=0;
            for (const dir of [{dx:-1,dy:0,dist:dL},{dx:1,dy:0,dist:dR},{dx:0,dy:-1,dist:dT},{dx:0,dy:1,dist:dB}]) {
                for (let dd = 1; dd <= sampleR; dd++) {
                    const sx = px + dir.dx*(dir.dist+dd), sy = py + dir.dy*(dir.dist+dd);
                    if (sx<0||sx>=imgW||sy<0||sy>=imgH) continue;
                    const wt = 1/(dd*dd);
                    const si = (sy*imgW+sx)*4;
                    sR+=orig[si]*wt; sG+=orig[si+1]*wt; sB+=orig[si+2]*wt; sW+=wt;
                }
            }
            if (sW > 0) {
                const pi = (py*imgW+px)*4;
                const noise = (Math.random()-0.5)*6;
                d[pi]   = Math.max(0,Math.min(255,Math.round(sR/sW+noise)));
                d[pi+1] = Math.max(0,Math.min(255,Math.round(sG/sW+noise)));
                d[pi+2] = Math.max(0,Math.min(255,Math.round(sB/sW+noise)));
            }
        }
    }
}

// ========== 辅助：边界像素填充 ==========
function fillBorder(d, orig, x, y, w, h, imgW, imgH) {
    const samples = [];
    for (let px = x; px < x+w; px += 3) {
        if (y > 0) { const i=((y-1)*imgW+px)*4; samples.push([orig[i],orig[i+1],orig[i+2]]); }
        if (y+h < imgH) { const i=((y+h)*imgW+px)*4; samples.push([orig[i],orig[i+1],orig[i+2]]); }
    }
    for (let py = y; py < y+h; py += 3) {
        if (x > 0) { const i=(py*imgW+x-1)*4; samples.push([orig[i],orig[i+1],orig[i+2]]); }
        if (x+w < imgW) { const i=(py*imgW+x+w)*4; samples.push([orig[i],orig[i+1],orig[i+2]]); }
    }
    if (!samples.length) return;
    let aR=0,aG=0,aB=0;
    samples.forEach(s => { aR+=s[0]; aG+=s[1]; aB+=s[2]; });
    aR=Math.round(aR/samples.length); aG=Math.round(aG/samples.length); aB=Math.round(aB/samples.length);
    for (let py = y; py < y+h; py++)
        for (let px = x; px < x+w; px++) {
            const i=(py*imgW+px)*4; d[i]=aR; d[i+1]=aG; d[i+2]=aB;
        }
}
