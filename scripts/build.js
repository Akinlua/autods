const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m'
};

console.log(`${colors.bright}${colors.blue}Building AutoDS-eBay Integration Application...${colors.reset}\n`);

// Create dist directory if it doesn't exist
const distDir = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir);
}

// Create a temporary package.json without .env in assets
const updatePackageJson = () => {
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageJson = require(packageJsonPath);
  
  // Create a deep copy of the package.json
  const tempPackageJson = JSON.parse(JSON.stringify(packageJson));
  
  // Remove .env from assets if present
  if (tempPackageJson.pkg && tempPackageJson.pkg.assets) {
    tempPackageJson.pkg.assets = tempPackageJson.pkg.assets.filter(asset => asset !== '.env');
  }
  
  // Write the temporary package.json
  const tempPackageJsonPath = path.join(__dirname, '..', 'temp-package.json');
  fs.writeFileSync(tempPackageJsonPath, JSON.stringify(tempPackageJson, null, 2));
  console.log(`${colors.green}Created temporary package.json without .env in assets${colors.reset}`);
  
  return tempPackageJsonPath;
};

// Restore the original package.json
const restorePackageJson = (tempPackageJsonPath) => {
  if (fs.existsSync(tempPackageJsonPath)) {
    fs.unlinkSync(tempPackageJsonPath);
    console.log(`${colors.green}Removed temporary package.json${colors.reset}`);
  }
};

try {
  // Create a temporary package.json without .env in assets
  const tempPackageJsonPath = updatePackageJson();
  
  // Build the executables using the temporary package.json
  console.log(`${colors.yellow}Building executables with pkg...${colors.reset}`);
  execSync(`npx pkg temp-package.json --targets node16-win-x64 --out-path dist`, { stdio: 'inherit' });
  
  // Restore the original package.json
  restorePackageJson(tempPackageJsonPath);
  
  // Rename the executables for clarity
  const targets = [
    { from: 'autods-win.exe', to: 'autods.exe' }
  ];

  targets.forEach(({ from, to }) => {
    const fromPath = path.join(distDir, from);
    const toPath = path.join(distDir, to);
    
    if (fs.existsSync(fromPath)) {
      fs.renameSync(fromPath, toPath);
      console.log(`${colors.green}Renamed ${from} to ${to}${colors.reset}`);
    }
  });

  // Copy .env.example to dist as template for user to create .env
  const envExamplePath = path.join(__dirname, '..', '.env.example');
  const envExampleDistPath = path.join(distDir, '.env.example');
  
  if (fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envExampleDistPath);
    console.log(`${colors.green}Copied .env.example to dist folder${colors.reset}`);
  } else {
    console.log(`${colors.yellow}Warning: .env.example file not found${colors.reset}`);
  }

  // Create an empty .env file in dist
  const envDistPath = path.join(distDir, '.env');
  fs.writeFileSync(envDistPath, '# Add your environment variables here\n# See .env.example for required variables\n');
  console.log(`${colors.green}Created empty .env file in dist folder${colors.reset}`);

  // Copy README to dist
  const readmePath = path.join(__dirname, '..', 'README.md');
  const readmeDistPath = path.join(distDir, 'README.md');
  
  if (fs.existsSync(readmePath)) {
    fs.copyFileSync(readmePath, readmeDistPath);
    console.log(`${colors.green}Copied README.md to dist folder${colors.reset}`);
  }

  // Create a quick-start guide for users
  const quickStartPath = path.join(distDir, 'QUICK-START.txt');
  const quickStartContent = `
=======================================================
  AutoDS-eBay Integration - Quick Start Guide
=======================================================

1. Edit the .env file in this directory with your credentials
   (use .env.example as a reference for required variables)
   
2. Run the application:
   - Double-click autods.exe or run it from command prompt

The application will run on port 3000 by default.
Visit http://localhost:3000 in your browser to see the status.

=======================================================
  Testing Individual Tasks
=======================================================

You can test specific tasks without waiting for their scheduled time:

  autods.exe list     (Run product listing task)
  autods.exe remove   (Run product removal task)
  autods.exe messages (Run customer message handling task)

=======================================================

For more details, see README.md
`;
  
  fs.writeFileSync(quickStartPath, quickStartContent);
  console.log(`${colors.green}Created QUICK-START.txt guide${colors.reset}`);

  console.log(`\n${colors.bright}${colors.magenta}Build completed successfully!${colors.reset}`);
  console.log(`\nExecutables are available in the "${colors.bright}dist${colors.reset}" directory.`);
  console.log(`Edit the ${colors.bright}.env${colors.reset} file with your API credentials before running the application.`);

  console.log(`\n${colors.bright}${colors.cyan}Testing Commands:${colors.reset}`);
  console.log(`Run product listing:    ${colors.bright}autods.exe list${colors.reset}`);
  console.log(`Run product removal:    ${colors.bright}autods.exe remove${colors.reset}`);
  console.log(`Run message handling:   ${colors.bright}autods.exe messages${colors.reset}`);
  console.log(`\nSee ${colors.bright}QUICK-START.txt${colors.reset} and ${colors.bright}README.md${colors.reset} for more information.`);

} catch (error) {
  console.error(`\n${colors.bright}${colors.red}Build failed:${colors.reset}`, error.message);
  process.exit(1);
} 