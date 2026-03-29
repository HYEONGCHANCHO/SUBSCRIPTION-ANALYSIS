const fs = require('fs');
const pdf = require('pdf-parse');

const filePath = process.argv[2];

if (!filePath) {
    process.exit(1);
}

async function run() {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        
        let data;
        // 패턴 1: 직접 호출
        if (typeof pdf === 'function') {
            data = await pdf(dataBuffer);
        } 
        // 패턴 2: .default 호출
        else if (pdf && typeof pdf.default === 'function') {
            data = await pdf.default(dataBuffer);
        }
        // 패턴 3: 그 외 (강제 시도)
        else {
            try {
                data = await pdf(dataBuffer);
            } catch (e) {
                data = await pdf.default(dataBuffer);
            }
        }

        if (data && data.text) {
            process.stdout.write(data.text);
        } else {
            throw new Error('No text found in PDF');
        }
    } catch (e) {
        process.stderr.write(e.message);
        process.exit(1);
    }
}

run();