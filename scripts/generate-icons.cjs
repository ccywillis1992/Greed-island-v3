const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

function generateAppIcon(width, height, outputPath) {
  const png = new PNG({ width, height });

  const bgR = 10, bgG = 13, bgB = 22; // #0A0D16
  const borderR = 30, borderG = 41, borderB = 59; // #1E293B
  const emeraldR = 16, emeraldG = 185, emeraldB = 129; // #10B981

  const rx = Math.floor(width * 0.22);

  // Helper to draw pixel
  function setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const idx = (width * y + x) << 2;
    png.data[idx] = r;
    png.data[idx + 1] = g;
    png.data[idx + 2] = b;
    png.data[idx + 3] = a;
  }

  // Draw background with rounded corners
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let isInside = true;

      // Check 4 rounded corners
      if (x < rx && y < rx) {
        isInside = (x - rx) ** 2 + (y - rx) ** 2 <= rx ** 2;
      } else if (x >= width - rx && y < rx) {
        isInside = (x - (width - rx)) ** 2 + (y - rx) ** 2 <= rx ** 2;
      } else if (x < rx && y >= height - rx) {
        isInside = (x - rx) ** 2 + (y - (height - rx)) ** 2 <= rx ** 2;
      } else if (x >= width - rx && y >= height - rx) {
        isInside = (x - (width - rx)) ** 2 + (y - (height - rx)) ** 2 <= rx ** 2;
      }

      if (isInside) {
        setPixel(x, y, bgR, bgG, bgB, 255);
      } else {
        setPixel(x, y, 0, 0, 0, 0);
      }
    }
  }

  // Draw inner border rectangle
  const borderMargin = Math.floor(width * 0.08);
  const borderWidth = Math.max(2, Math.floor(width * 0.015));
  for (let y = borderMargin; y < height - borderMargin; y++) {
    for (let x = borderMargin; x < width - borderMargin; x++) {
      const isBorder =
        x < borderMargin + borderWidth ||
        x >= width - borderMargin - borderWidth ||
        y < borderMargin + borderWidth ||
        y >= height - borderMargin - borderWidth;
      if (isBorder) {
        // Only if inside background
        const idx = (width * y + x) << 2;
        if (png.data[idx + 3] > 0) {
          setPixel(x, y, borderR, borderG, borderB, 255);
        }
      }
    }
  }

  // Draw trend line segments: (0.25, 0.68) -> (0.40, 0.47) -> (0.56, 0.56) -> (0.75, 0.28)
  const pts = [
    { x: Math.floor(width * 0.25), y: Math.floor(height * 0.68) },
    { x: Math.floor(width * 0.40), y: Math.floor(height * 0.47) },
    { x: Math.floor(width * 0.56), y: Math.floor(height * 0.56) },
    { x: Math.floor(width * 0.75), y: Math.floor(height * 0.28) },
  ];

  const lineWidth = Math.max(3, Math.floor(width * 0.055));

  function drawThickLine(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const steps = Math.max(Math.abs(dx), Math.abs(dy)) * 2;
    for (let i = 0; i <= steps; i++) {
      const cx = p1.x + (dx * i) / steps;
      const cy = p1.y + (dy * i) / steps;
      const r = lineWidth / 2;
      for (let py = Math.floor(cy - r); py <= Math.ceil(cy + r); py++) {
        for (let px = Math.floor(cx - r); px <= Math.ceil(cx + r); px++) {
          if ((px - cx) ** 2 + (py - cy) ** 2 <= r ** 2) {
            setPixel(Math.floor(px), Math.floor(py), emeraldR, emeraldG, emeraldB, 255);
          }
        }
      }
    }
  }

  drawThickLine(pts[0], pts[1]);
  drawThickLine(pts[1], pts[2]);
  drawThickLine(pts[2], pts[3]);

  // Draw glowing circle dot at top right endpoint
  const dotR = Math.max(5, Math.floor(width * 0.045));
  const lastPt = pts[pts.length - 1];
  for (let py = lastPt.y - dotR * 2; py <= lastPt.y + dotR * 2; py++) {
    for (let px = lastPt.x - dotR * 2; px <= lastPt.x + dotR * 2; px++) {
      const distSq = (px - lastPt.x) ** 2 + (py - lastPt.y) ** 2;
      if (distSq <= dotR ** 2) {
        setPixel(px, py, emeraldR, emeraldG, emeraldB, 255);
      }
    }
  }

  const buffer = PNG.sync.write(png);
  fs.writeFileSync(outputPath, buffer);
  console.log(`Generated ${outputPath} (${width}x${height})`);
}

generateAppIcon(192, 192, path.join(__dirname, '../public/pwa-192.png'));
generateAppIcon(512, 512, path.join(__dirname, '../public/pwa-512.png'));
generateAppIcon(180, 180, path.join(__dirname, '../public/apple-touch-icon.png'));
