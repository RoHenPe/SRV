const fs = require('fs');
const path = require('path');

const sandboxDir = path.join(__dirname, 'app', 'api', 'sandbox');
const dirs = fs.readdirSync(sandboxDir);

dirs.forEach(dir => {
  const routePath = path.join(sandboxDir, dir, 'route.js');
  if (fs.existsSync(routePath)) {
    let content = fs.readFileSync(routePath, 'utf8');
    
    // Remove ngrok import
    content = content.replace("import { startNgrok } from '@/lib/ngrok';\n", "");
    
    // Revert URL and host logic
    content = content.replace(/const host = getTargetHost\(\);\n      const ngrokUrl = await startNgrok\(\d+\);\n      return \{/g, "const host = getTargetHost();\n      return {");
    
    content = content.replace(/url: ngrokUrl \? ngrokUrl \+ "[^"]*" : `([^`]+)`/g, "url: `$1`");
    
    fs.writeFileSync(routePath, content, 'utf8');
    console.log(`Reverted ${routePath}`);
  }
});
