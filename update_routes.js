const fs = require('fs');
const path = require('path');

const sandboxDir = path.join(__dirname, 'app', 'api', 'sandbox');
const dirs = fs.readdirSync(sandboxDir);

dirs.forEach(dir => {
  const routePath = path.join(sandboxDir, dir, 'route.js');
  if (fs.existsSync(routePath)) {
    let content = fs.readFileSync(routePath, 'utf8');
    if (!content.includes('import { startNgrok }')) {
      content = content.replace("import { runSSH, getTargetHost, apiHandler } from '@/lib/ssh';", "import { runSSH, getTargetHost, apiHandler } from '@/lib/ssh';\nimport { startNgrok } from '@/lib/ngrok';");
      
      const match = content.match(/url: `http:\/\/\$\{host\}:(\d+)([^`]*)`/);
      if (match) {
        const port = match[1];
        const subPath = match[2] || '';
        content = content.replace("const host = getTargetHost();\n      return {", `const host = getTargetHost();\n      const ngrokUrl = await startNgrok(${port});\n      return {`);
        content = content.replace(/url: `http:\/\/\$\{host\}:\d+[^`]*`,/, `url: ngrokUrl ? ngrokUrl + "${subPath}" : \`http://\${host}:${port}${subPath}\`,`);
        fs.writeFileSync(routePath, content, 'utf8');
        console.log(`Updated ${routePath}`);
      }
    }
  }
});

// Also update services route.js
const servicesRoutePath = path.join(__dirname, 'app', 'api', 'services', 'route.js');
if (fs.existsSync(servicesRoutePath)) {
  let content = fs.readFileSync(servicesRoutePath, 'utf8');
  if (!content.includes('import { startNgrok }')) {
    content = content.replace("import { runSSH, getTargetHost, apiHandler } from '@/lib/ssh';", "import { runSSH, getTargetHost, apiHandler } from '@/lib/ssh';\nimport { startNgrok } from '@/lib/ngrok';");
    
    // In services/route.js, port mapping:
    // ttyd -> 7681, cups -> 631, scanner -> 8080, portal -> 3003
    // But services/route.js currently doesn't return the URL directly in the start response, 
    // Wait, let's see what services/route.js returns.
  }
}
