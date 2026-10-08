import { jsPDF } from "jspdf";
import type { HistoryEntry } from "./history";

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function badgeColor(status: string): [number, number, number] {
  if (status === "success") return [0, 230, 190];
  if (status === "corrupted") return [255, 190, 60];
  return [255, 90, 120];
}

function drawEntryPage(doc: jsPDF, e: HistoryEntry, pageLabel: string) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(11, 14, 23);
  doc.rect(0, 0, W, 34, "F");
  doc.setFillColor(0, 240, 255);
  doc.rect(0, 34, W, 1.2, "F");
  doc.setTextColor(0, 240, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("STEGANOVAULT PRO  //  AUDIT REPORT", 14, 14);
  doc.setTextColor(150, 165, 190);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(pageLabel + "   |   Local-only processing - nothing uploaded.", 14, 23);
  doc.setTextColor(120, 130, 150);
  doc.text(fmtDate(e.timestamp), W - 14, 23, { align: "right" });

  let y = 46;
  doc.setTextColor(20, 25, 40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text((e.action === "encode" ? "ENCODE" : "DECODE") + "  -  " + e.filename.slice(0, 48), 14, y);
  y += 6;
  const [r, g, b] = badgeColor(e.status);
  doc.setFillColor(r, g, b);
  doc.roundedRect(14, y, 34, 8, 2, 2, "F");
  doc.setTextColor(11, 14, 23);
  doc.setFontSize(8);
  doc.text(e.status.toUpperCase(), 31, y + 5.6, { align: "center" });
  doc.setTextColor(90, 100, 120);
  doc.setFont("helvetica", "normal");
  doc.text(e.imageW + "x" + e.imageH + "px  |  LSB-" + e.bitDepth + "bit  |  " + (e.encrypted ? "AES-256-GCM" : "plaintext") + "  |  " + e.payloadBytes + " B / " + e.capacityBytes + " B", 52, y + 5.6);
  y += 16;

  try {
    if (e.thumbnail) doc.addImage(e.thumbnail, "PNG", 14, y, 52, 52);
  } catch { /* ignore */ }
  doc.setDrawColor(220, 228, 240);
  doc.roundedRect(14, y, 52, 52, 2, 2, "S");
  doc.setFontSize(8);
  let my = y + 5;
  const meta: [string, string][] = [
    ["Entry ID", e.id],
    ["SHA-256", e.sha256.slice(0, 44) + "..."],
    ["Integrity", e.hexVerdict],
    ["Capacity", e.payloadBytes.toLocaleString() + " B payload"],
  ];
  meta.forEach(([k, v]) => {
    doc.setTextColor(120, 130, 150);
    doc.setFont("helvetica", "bold");
    doc.text(k.toUpperCase(), 74, my);
    doc.setTextColor(25, 32, 48);
    doc.setFont("helvetica", "normal");
    doc.text(String(v).slice(0, 64), 74, my + 4.4);
    my += 12;
  });
  y += 60;

  doc.setFillColor(17, 24, 39);
  doc.roundedRect(14, y, W - 28, 12, 2, 2, "F");
  doc.setTextColor(0, 240, 255);
  doc.setFontSize(7.2);
  doc.setFont("courier", "bold");
  doc.text(e.verdictSummary.slice(0, 120), 18, y + 7.4);
  y += 19;

  doc.setTextColor(25, 32, 48);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("EMBEDDED / EXTRACTED MESSAGE", 14, y);
  y += 5;
  doc.setFont("courier", "normal");
  doc.setFontSize(8);
  doc.setTextColor(40, 48, 66);
  const msg = e.fullMessage || "(binary / empty payload)";
  const lines = doc.splitTextToSize(msg.slice(0, 1400), W - 28);
  doc.text(lines.slice(0, 14), 14, y);
  y += Math.min(14, lines.length) * 4 + 8;

  if (y < 238) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(25, 32, 48);
    doc.text("HEX DUMP (first 1,024 bytes - * = modified)", 14, y);
    y += 5;
    doc.setFont("courier", "normal");
    doc.setFontSize(6.6);
    doc.setTextColor(70, 80, 100);
    e.hexLines.slice(0, 12).forEach((l) => {
      const hexStr = l.hex.map((h, i) => (l.hot[i] ? h.toUpperCase() + "*" : h)).join(" ");
      doc.text(l.offset.toString(16).padStart(4, "0") + "  " + hexStr, 14, y);
      y += 3.8;
      if (y > 282) return;
    });
  }
  doc.setFontSize(7);
  doc.setTextColor(140, 150, 170);
  doc.text("SteganoVault Pro - client-side LSB steganography - verify SHA-256 before trusting extracts", W / 2, 290, { align: "center" });
}

export function downloadEntryPDF(e: HistoryEntry) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  drawEntryPage(doc, e, "ENTRY " + e.id.slice(0, 8).toUpperCase());
  doc.save("steganovault-" + e.action + "-" + e.id.slice(0, 8) + ".pdf");
}

export function downloadAllPDF(entries: HistoryEntry[]) {
  if (entries.length === 0) return;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  entries.forEach((e, i) => {
    if (i > 0) doc.addPage();
    drawEntryPage(doc, e, "ENTRY " + (i + 1) + " OF " + entries.length);
  });
  doc.save("steganovault-full-audit-" + entries.length + "-entries.pdf");
}

export async function downloadReportCard(e: HistoryEntry) {
  const W = 1000, H = 640;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d")!;
  const grad = x.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#0b0e17");
  grad.addColorStop(0.55, "#131a2e");
  grad.addColorStop(1, "#1b1035");
  x.fillStyle = grad;
  x.fillRect(0, 0, W, H);
  x.strokeStyle = "rgba(0,240,255,0.07)";
  x.lineWidth = 1;
  for (let gx = 0; gx < W; gx += 40) { x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx, H); x.stroke(); }
  for (let gy = 0; gy < H; gy += 40) { x.beginPath(); x.moveTo(0, gy); x.lineTo(W, gy); x.stroke(); }
  const bar = x.createLinearGradient(0, 0, W, 0);
  bar.addColorStop(0, "#00f0ff");
  bar.addColorStop(1, "#a855f7");
  x.fillStyle = bar;
  x.fillRect(0, 0, W, 6);
  x.fillStyle = "#00f0ff";
  x.font = "bold 30px monospace";
  x.fillText("STEGANOVAULT PRO", 48, 66);
  x.fillStyle = "rgba(230,240,255,0.65)";
  x.font = "15px monospace";
  x.fillText(e.action.toUpperCase() + " REPORT  |  " + new Date(e.timestamp).toLocaleString(), 48, 94);
  const col = e.status === "success" ? "#00f0c8" : e.status === "corrupted" ? "#ffbe3c" : "#ff5a78";
  x.fillStyle = col;
  x.beginPath();
  (x as unknown as { roundRect: (...a: number[]) => void }).roundRect(W - 230, 36, 182, 44, 22);
  x.fill();
  x.fillStyle = "#0b0e17";
  x.font = "bold 20px monospace";
  x.textAlign = "center";
  x.fillText(e.status.toUpperCase(), W - 139, 64);
  x.textAlign = "left";
  await new Promise<void>((res) => {
    if (!e.thumbnail) return res();
    const im = new Image();
    im.onload = () => {
      x.save();
      x.beginPath();
      (x as unknown as { roundRect: (...a: number[]) => void }).roundRect(48, 130, 300, 300, 18);
      x.clip();
      x.drawImage(im, 48, 130, 300, 300);
      x.restore();
      x.strokeStyle = "rgba(0,240,255,0.5)";
      x.lineWidth = 2;
      x.beginPath();
      (x as unknown as { roundRect: (...a: number[]) => void }).roundRect(48, 130, 300, 300, 18);
      x.stroke();
      res();
    };
    im.onerror = () => res();
    im.src = e.thumbnail;
  });
  let yy = 150;
  const rows: [string, string][] = [
    ["FILE", e.filename],
    ["MODE", (e.encrypted ? "AES-256-GCM" : "PLAINTEXT") + " / LSB-" + e.bitDepth + "bit"],
    ["SIZE", e.imageW + "x" + e.imageH + "px  |  " + e.payloadBytes + "B payload"],
    ["SHA-256", e.sha256.slice(0, 40) + "..."],
    ["VERDICT", e.hexVerdict.slice(0, 52)],
  ];
  rows.forEach(([k, v]) => {
    x.fillStyle = "rgba(0,240,255,0.8)";
    x.font = "bold 13px monospace";
    x.fillText(k, 380, yy);
    x.fillStyle = "#e8eefc";
    x.font = "14px monospace";
    x.fillText(String(v).slice(0, 48), 380, yy + 22);
    yy += 56;
  });
  x.fillStyle = "rgba(255,255,255,0.05)";
  x.beginPath();
  (x as unknown as { roundRect: (...a: number[]) => void }).roundRect(48, 452, W - 96, 92, 14);
  x.fill();
  x.strokeStyle = "rgba(168,85,247,0.45)";
  x.stroke();
  x.fillStyle = "#cfd8ee";
  x.font = "14px monospace";
  const msg = (e.messagePreview || "(no preview)").slice(0, 140);
  x.fillText("MESSAGE PREVIEW:", 68, 478);
  x.fillStyle = "#ffffff";
  x.fillText(msg.slice(0, 78), 68, 502);
  if (msg.length > 78) x.fillText(msg.slice(78, 150), 68, 522);
  x.fillStyle = "#0e1424";
  x.beginPath();
  (x as unknown as { roundRect: (...a: number[]) => void }).roundRect(48, 556, W - 96, 44, 10);
  x.fill();
  x.fillStyle = "#00f0ff";
  x.font = "bold 12px monospace";
  x.fillText(e.verdictSummary.slice(0, 108), 64, 582);
  const a = document.createElement("a");
  a.download = "steganovault-card-" + e.id.slice(0, 8) + ".png";
  a.href = c.toDataURL("image/png");
  a.click();
}
