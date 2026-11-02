// 브라우저에서 스크린샷 → 카드 결제 후보. 이미지는 기기 밖으로 나가지 않는다.
// 글자 인식 모델(약 7MB)은 처음 쓸 때 jsdelivr CDN에서 받아 브라우저에 저장해 둔다.
import type { Line, Page, Worker } from 'tesseract.js';
import { extractPayments, isConfident, GAP_MARK, type PaymentCandidate } from './extract';

let workerPromise: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
	workerPromise ??= import('tesseract.js').then(({ createWorker }) => createWorker('kor+eng', 1));
	return workerPromise;
}

interface PassOptions {
	textMin?: number; // 이 밝기 이상인 픽셀만 글자로 남김 (사진 위 흰 글씨용)
}

function otsu(hist: number[], total: number): number {
	let sum = 0;
	for (let i = 0; i < 256; i++) sum += i * hist[i];
	let sumB = 0;
	let wB = 0;
	let best = 0;
	let th = 128;
	for (let t = 0; t < 256; t++) {
		wB += hist[t];
		if (!wB) continue;
		const wF = total - wB;
		if (!wF) break;
		sumB += t * hist[t];
		const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
		if (between > best) {
			best = between;
			th = t;
		}
	}
	return th;
}

// 작은 이미지는 키우고 회색조로 바꾼다. 다크 모드는 흑백으로 만든 뒤 반전하고,
// textMin 이 있으면 밝은 글자만 검게 남긴다.
async function preprocess(blob: Blob, { textMin }: PassOptions): Promise<HTMLCanvasElement> {
	const bmp = await createImageBitmap(blob);
	const scale = bmp.width < 1000 ? 2 : 1;
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(bmp.width * scale);
	canvas.height = Math.round(bmp.height * scale);
	const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
	const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
	const d = img.data;
	const hist = new Array<number>(256).fill(0);
	let sum = 0;
	for (let i = 0; i < d.length; i += 4) {
		const y = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
		d[i] = y;
		sum += y;
		hist[y]++;
	}
	const n = d.length / 4;
	const dark = sum / n < 110;
	const th = dark ? otsu(hist, n) : -1;
	for (let i = 0; i < d.length; i += 4) {
		let y = d[i];
		if (textMin) y = y >= textMin ? 0 : 255;
		else if (dark) y = y > th ? 0 : 255;
		d[i] = d[i + 1] = d[i + 2] = y;
	}
	ctx.putImageData(img, 0, 0);
	return canvas;
}

// 줄 위치를 보고, 줄 사이가 평소 줄 높이보다 크게 벌어진 곳(다른 말풍선·알림)에 구분 표시를 넣는다.
// 또 덩어리마다 확실한 글자들의 왼쪽 경계를 구해, 그보다 왼쪽(앱 아이콘 자리)에서
// 읽힌 줄 머리 잡음("67", "를", "p=")을 지운다.
function textWithGaps(data: Page, gapFactor = 0.8): string {
	const lines: Line[] = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
	if (!lines.length) return data.text;
	lines.sort((a, b) => a.bbox.y0 - b.bbox.y0);
	const heights = lines.map((l) => l.bbox.y1 - l.bbox.y0).sort((a, b) => a - b);
	const h = heights[Math.floor(heights.length / 2)];

	const groups: Line[][] = [];
	lines.forEach((l, i) => {
		if (i === 0 || l.bbox.y0 - lines[i - 1].bbox.y1 > gapFactor * h) groups.push([]);
		groups[groups.length - 1].push(l);
	});

	return groups
		.map((group) => {
			const sure = group.flatMap((l) => l.words).filter((w) => w.confidence >= 85 && /[가-힣A-Za-z0-9]/.test(w.text));
			const edge = sure.length ? Math.min(...sure.map((w) => w.bbox.x0)) : -1;
			return group
				.map((l) => {
					let text = l.text.replace(/\n$/, '');
					for (const w of l.words) {
						if (w.bbox.x1 > edge) break;
						const t = text.trimStart();
						if (!t.startsWith(w.text)) break;
						text = t.slice(w.text.length);
					}
					return text.trim();
				})
				.filter(Boolean)
				.join('\n');
		})
		.join(`\n${GAP_MARK}\n`);
}

// 1차: 일반 처리. 확실한 후보가 없으면 2차: 밝은 글자만 남기기(잠금화면 알림처럼 사진 위 흰 글씨).
const PASSES: PassOptions[] = [{}, { textMin: 225 }];

export async function readPaymentsFromImage(blob: Blob): Promise<PaymentCandidate[]> {
	const worker = await getWorker();
	let best: { candidates: PaymentCandidate[]; confident: number } | null = null;
	for (const pass of PASSES) {
		const canvas = await preprocess(blob, pass);
		const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
		const candidates = extractPayments(textWithGaps(data));
		const confident = candidates.filter(isConfident).length;
		if (!best || confident > best.confident) best = { candidates, confident };
		if (confident > 0) break;
	}
	return best?.candidates ?? [];
}
