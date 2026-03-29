const fs = require('fs');
const pdf = require('pdf-parse');

async function extract(filePath) {
    if (!fs.existsSync(filePath)) {
        process.exit(1);
    }
    const dataBuffer = fs.readFileSync(filePath);
    try {
        const data = await pdf(dataBuffer);
        process.stdout.write(data.text);
    } catch (e) {
        process.stderr.write(e.message);
        process.exit(1);
    }
}

const targetFile = process.argv[2];
if (targetFile) {
    extract(targetFile);
} else {
    process.exit(1);
}