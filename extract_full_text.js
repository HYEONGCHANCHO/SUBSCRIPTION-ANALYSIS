const fs = require('fs');
const pdf = require('pdf-parse');

async function extractFullText(filePath) {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdf(dataBuffer);
        return data.text;
    } catch (e) {
        console.error(e);
        return null;
    }
}

const filePath = process.argv[2];
if (filePath) {
    extractFullText(filePath).then(text => {
        if (text) process.stdout.write(text);
        else process.exit(1);
    });
}
