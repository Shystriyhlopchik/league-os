const fs = require('node:fs');
const path = require('node:path');
const sharp = require(process.argv[2] || 'sharp');

const brand = path.resolve(__dirname, '../../../league-os-frontend/public/brand');
const files = {
  photo: path.join(brand, 'photos/team-emotion.jpg'),
  logo: path.join(brand, 'logos/stacked_white.svg'),
  oswald: path.join(__dirname, 'fonts/Oswald-Variable.ttf'),
  manrope: path.join(__dirname, 'fonts/Manrope-Variable.ttf'),
};

async function build() {
  const replacements = {
    PHOTO_DATA_URI: 'data:image/jpeg;base64,' + fs.readFileSync(files.photo).toString('base64'),
    LOGO_VECTOR: fs.readFileSync(files.logo, 'utf8').replace(/^<\?xml[^>]*>\s*/, '').trim(),
    OSWALD_DATA_URI: 'data:font/ttf;base64,' + fs.readFileSync(files.oswald).toString('base64'),
    MANROPE_DATA_URI: 'data:font/ttf;base64,' + fs.readFileSync(files.manrope).toString('base64'),
  };
  const source = fs.readFileSync(path.join(__dirname, 'league-start-1080x1350.source.svg'), 'utf8');
  const svg = source.replace(/\{\{([A-Z_]+)\}\}/g, (token, key) => {
    if (!(key in replacements)) throw new Error('Unknown token: ' + token);
    return replacements[key];
  });
  const svgPath = path.join(__dirname, 'league-start-1080x1350.svg');
  const pngPath = path.join(__dirname, 'league-start-1080x1350.png');
  fs.writeFileSync(svgPath, svg, 'utf8');

  for (const [font, fontfile] of [['Oswald Bold', files.oswald], ['Manrope Bold', files.manrope]]) {
    await sharp({ text: { text: 'ДВОРОВАЯ ЛИГА', font, fontfile, dpi: 72 } }).png().toBuffer();
  }
  await sharp(Buffer.from(svg), { density: 72 }).png().toFile(pngPath);
  const metadata = await sharp(pngPath).metadata();
  if (metadata.width !== 1080 || metadata.height !== 1350) throw new Error('Invalid canvas size');
  console.log(JSON.stringify({ svgPath, pngPath, width: metadata.width, height: metadata.height,
    svgBytes: fs.statSync(svgPath).size, pngBytes: fs.statSync(pngPath).size }));
}

build().catch(error => { console.error(error); process.exitCode = 1; });
