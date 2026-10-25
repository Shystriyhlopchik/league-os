const fs = require('node:fs');
const path = require('node:path');

process.env.FONTCONFIG_FILE = path.join(__dirname, 'fontconfig.xml');
const sharp = require(process.argv[2] || 'sharp');

async function render() {
  const source = path.join(__dirname, 'league-outro-1920x1080.svg');
  const output = path.join(__dirname, 'league-outro-1920x1080.png');
  const fontDir = path.join(__dirname, 'fonts');

  for (const [family, file] of [
    ['Oswald Bold', 'Oswald-Variable.ttf'],
    ['Manrope Bold', 'Manrope-Variable.ttf'],
  ]) {
    await sharp({ text: {
      text: 'УВИДИМСЯ НА ПОЛЕ', font: family,
      fontfile: path.join(fontDir, file), dpi: 72,
    } }).png().toBuffer();
  }

  await sharp(source, { density: 72 }).png().toFile(output);
  const metadata = await sharp(output).metadata();
  if (metadata.width !== 1920 || metadata.height !== 1080) {
    throw new Error('Unexpected output size');
  }
  console.log(JSON.stringify({ output, width: metadata.width,
    height: metadata.height, bytes: fs.statSync(output).size }));
}

render().catch(error => { console.error(error); process.exitCode = 1; });
