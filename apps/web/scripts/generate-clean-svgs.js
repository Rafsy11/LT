const fs = require('fs');

function buildCleanLogoSvg() {
  const raw = fs.readFileSync('docs/assets/Logo.svg', 'utf8');
  
  // Extract all path elements
  const pathRegex = /<path\s+d="([^"]+)"\s+fill="([^"]+)"(?:\s+transform="([^"]+)")?\s*\/>/g;
  let m;
  const coloredPaths = [];

  while ((m = pathRegex.exec(raw)) !== null) {
    const d = m[1];
    const fill = m[2];
    const transform = m[3];
    // Keep all colored paths (non-white/light)
    if (!fill.toLowerCase().startsWith('#f')) {
      coloredPaths.push({ d, fill, transform });
    }
  }

  console.log('Generating Clean Logo.svg with', coloredPaths.length, 'paths');

  let svgContent = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  svgContent += `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="360 60 480 480" width="480" height="480" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" image-rendering="optimizeQuality">\n`;
  
  for (const p of coloredPaths) {
    if (p.transform) {
      svgContent += `  <path d="${p.d}" fill="${p.fill}" transform="${p.transform}" />\n`;
    } else {
      svgContent += `  <path d="${p.d}" fill="${p.fill}" />\n`;
    }
  }
  
  svgContent += `</svg>\n`;
  return svgContent;
}

function buildCleanLintasartaLogo(isDark = false) {
  const raw = fs.readFileSync('docs/assets/Lintasarta-Logo.svg', 'utf8');
  
  const pathRegex = /<path\s+d="([^"]+)"\s+fill="([^"]+)"(?:\s+transform="([^"]+)")?\s*\/>/g;
  let m;
  const paths = [];

  while ((m = pathRegex.exec(raw)) !== null) {
    const d = m[1];
    let fill = m[2];
    const transform = m[3];

    if (isDark) {
      // Calculate approximate X position to check if it belongs to wordmark (X < 1015)
      let tx = 0;
      if (transform) {
        const tm = transform.match(/translate\(([^,]+),([^)]+)\)/);
        if (tm) tx = parseFloat(tm[1]);
      }
      const nums = d.match(/-?\d+(\.\d+)?/g);
      let pMinX = Infinity;
      if (nums) {
        for (let i = 0; i < nums.length; i += 2) {
          const x = parseFloat(nums[i]) + tx;
          if (!isNaN(x) && x < pMinX) pMinX = x;
        }
      }

      // If in wordmark area (X < 1015) and dark, convert to white (#F1F5F9)
      if (pMinX < 1015) {
        fill = '#F1F5F9';
      }
    }

    paths.push({ d, fill, transform });
  }

  console.log(`Generating Clean Lintasarta-Logo (isDark=${isDark}) with`, paths.length, 'paths');

  let svgContent = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  svgContent += `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 50 1232 370" width="1232" height="370" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" image-rendering="optimizeQuality">\n`;
  
  for (const p of paths) {
    if (p.transform) {
      svgContent += `  <path d="${p.d}" fill="${p.fill}" transform="${p.transform}" />\n`;
    } else {
      svgContent += `  <path d="${p.d}" fill="${p.fill}" />\n`;
    }
  }
  
  svgContent += `</svg>\n`;
  return svgContent;
}

const cleanLogo = buildCleanLogoSvg();
const cleanLintasarta = buildCleanLintasartaLogo(false);
const cleanLintasartaDark = buildCleanLintasartaLogo(true);

fs.writeFileSync('docs/assets/Logo.svg', cleanLogo, 'utf8');
fs.writeFileSync('docs/assets/Lintasarta-Logo.svg', cleanLintasarta, 'utf8');
fs.writeFileSync('docs/assets/Lintasarta-Logo-Dark.svg', cleanLintasartaDark, 'utf8');

// Also sync to apps/web/public/assets
fs.writeFileSync('apps/web/public/assets/Logo.svg', cleanLogo, 'utf8');
fs.writeFileSync('apps/web/public/assets/Lintasarta-Logo.svg', cleanLintasarta, 'utf8');
fs.writeFileSync('apps/web/public/assets/lintasarta-logo.svg', cleanLintasarta, 'utf8');
fs.writeFileSync('apps/web/public/assets/Lintasarta-Logo-Dark.svg', cleanLintasartaDark, 'utf8');

console.log('All SVG assets generated and synchronized successfully!');

