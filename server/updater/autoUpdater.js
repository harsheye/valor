import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import http from 'http';
import https from 'https';
import { spawn, execSync } from 'child_process';

/**
 * AutoUpdater for Valor
 * 
 * Periodically checks GitHub for the latest patches on branch `production`.
 * If a new patch is detected on GitHub, it automatically fetches the update,
 * updates dependencies and builds if needed, and gracefully self-restarts the running instance.
 */
export class AutoUpdater {
  constructor(options = {}) {
    this.appDir = options.appDir || process.cwd();
    this.dataDir = options.dataDir || path.join(this.appDir, '.valor_data');
    this.dataStore = options.dataStore || null;
    this.eventBus = options.globalEventBus || null;
    this.isProd = Boolean(options.isProd);

    // Update targets
    this.branch = process.env.VALOR_UPDATE_BRANCH || 'production';
    this.repo = process.env.VALOR_UPDATE_REPO || this.detectGitHubRepo() || 'harsheye/valor';

    // Interval: default 5 minutes (300,000 ms), minimum 30 seconds
    const intervalArg = process.env.VALOR_UPDATE_INTERVAL_MS || process.env.VALOR_UPDATE_INTERVAL;
    this.intervalMs = intervalArg ? Math.max(30000, parseInt(intervalArg, 10)) : 5 * 60 * 1000;

    // Flags
    this.enabled = process.env.VALOR_AUTO_UPDATE !== 'false' && !process.argv.includes('--no-auto-update');
    this.autoApply = process.env.VALOR_AUTO_APPLY !== 'false';
    this.allowForceBranchSwitch = process.env.VALOR_FORCE_BRANCH_SWITCH === 'true';

    // State
    this.status = 'idle'; // 'idle' | 'checking' | 'update-available' | 'downloading' | 'applying' | 'building' | 'restarting' | 'error'
    this.currentCommit = null;
    this.latestCommit = null;
    this.latestCommitInfo = null;
    this.lastCheckedAt = null;
    this.lastError = null;
    this.isUpdating = false;
    this.etag = null;

    // Files
    this.logFile = path.join(this.dataDir, 'update.log');
    this.commitFile = path.join(this.dataDir, 'installed_commit.txt');
    this.historyFile = path.join(this.dataDir, 'update_history.json');

    // Timers
    this.checkTimer = null;
    this.initialTimer = null;
  }

  /**
   * Parse GitHub repo owner/name from git remote origin if available.
   */
  detectGitHubRepo() {
    try {
      const url = execSync('git remote get-url origin', { cwd: this.appDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+)(\.git)?/i);
      if (match) {
        return `${match[1]}/${match[2]}`;
      }
    } catch {}
    return null;
  }

  /**
   * Determine if the instance runs in a Git repository.
   */
  isGitRepo() {
    return fs.existsSync(path.join(this.appDir, '.git'));
  }

  /**
   * Get the current local git branch name if available.
   */
  getCurrentBranch() {
    if (!this.isGitRepo()) return null;
    try {
      return execSync('git rev-parse --abbrev-ref HEAD', { cwd: this.appDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      return null;
    }
  }

  /**
   * Get the current local commit hash.
   */
  detectCurrentCommit() {
    if (this.isGitRepo()) {
      try {
        const hash = execSync('git rev-parse HEAD', { cwd: this.appDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
        if (hash && hash.length >= 7) {
          return hash;
        }
      } catch {}
    }

    try {
      if (fs.existsSync(this.commitFile)) {
        const saved = fs.readFileSync(this.commitFile, 'utf8').trim();
        if (saved) return saved;
      }
    } catch {}

    return 'unknown';
  }

  /**
   * Logger helper that writes to stdout and file.
   */
  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const line = `[AutoUpdater][${timestamp}] ${message}`;
    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }

    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      fs.appendFileSync(this.logFile, line + '\n', 'utf8');
    } catch {}
  }

  /**
   * Initialize current commit and protect runtime data files from git operations.
   */
  async init() {
    if (!fs.existsSync(this.dataDir)) {
      try { fs.mkdirSync(this.dataDir, { recursive: true }); } catch {}
    }

    // Protect sqlite database and runtime state from git index touches
    if (this.isGitRepo()) {
      try {
        execSync('git update-index --skip-worktree .valor_data/valor.db', { cwd: this.appDir, stdio: 'ignore' });
      } catch {}
    }

    this.currentCommit = this.detectCurrentCommit();

    // If installed_commit.txt does not exist, save current commit
    if (this.currentCommit !== 'unknown' && !fs.existsSync(this.commitFile)) {
      try {
        fs.writeFileSync(this.commitFile, this.currentCommit, 'utf8');
      } catch {}
    }

    const currentBranch = this.getCurrentBranch();
    this.log(`Initialized auto-updater. Monitoring repo: ${this.repo}, branch: ${this.branch}. Current commit: ${this.currentCommit.substring(0, 7)}${currentBranch ? ` (local branch: ${currentBranch})` : ''}`);
  }

  /**
   * Start recurring background update checks.
   */
  start() {
    if (!this.enabled) {
      this.log('Auto-update is disabled by configuration (VALOR_AUTO_UPDATE=false).', 'warn');
      return;
    }

    this.log(`Background auto-update service active. Checking branch '${this.branch}' every ${Math.round(this.intervalMs / 1000)}s.`);

    // Perform first check after 20 seconds to allow the server to finish booting smoothly
    this.initialTimer = setTimeout(() => {
      this.checkForUpdates().catch(err => {
        this.log(`Initial update check error: ${err.message}`, 'error');
      });
    }, 20000);
    if (this.initialTimer.unref) this.initialTimer.unref();

    // Recurring interval
    this.checkTimer = setInterval(() => {
      this.checkForUpdates().catch(err => {
        this.log(`Scheduled update check error: ${err.message}`, 'error');
      });
    }, this.intervalMs);
    if (this.checkTimer.unref) this.checkTimer.unref();
  }

  /**
   * Stop background checking.
   */
  stop() {
    if (this.initialTimer) clearTimeout(this.initialTimer);
    if (this.checkTimer) clearInterval(this.checkTimer);
  }

  /**
   * Fetch latest commit SHA on remote branch using Git CLI or GitHub API.
   */
  async fetchRemoteCommit() {
    // 1. Try fast git ls-remote if git is available
    if (this.isGitRepo()) {
      try {
        const out = execSync(`git ls-remote origin refs/heads/${this.branch}`, {
          cwd: this.appDir,
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 10000
        }).toString().trim();

        if (out) {
          const parts = out.split(/\s+/);
          const sha = parts[0]?.trim();
          if (sha && /^[0-9a-f]{40}$/i.test(sha)) {
            return { sha, message: `Patched commit on ${this.branch}`, author: 'GitHub', date: new Date().toISOString() };
          }
        }
      } catch (err) {
        // Fallback to GitHub API
      }
    }

    // 2. Query GitHub REST API
    return new Promise((resolve, reject) => {
      const url = `https://api.github.com/repos/${this.repo}/commits/${encodeURIComponent(this.branch)}`;
      const headers = {
        'User-Agent': 'Valor-AutoUpdater',
        'Accept': 'application/vnd.github.v3+json'
      };

      if (this.etag) {
        headers['If-None-Match'] = this.etag;
      }

      const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const req = https.get(url, { headers, timeout: 12000 }, (res) => {
        if (res.statusCode === 304) {
          // Not modified, same as last check
          return resolve({ notModified: true, sha: this.latestCommit || this.currentCommit });
        }

        if (res.statusCode !== 200) {
          let errBody = '';
          res.on('data', c => { errBody += c; });
          res.on('end', () => {
            reject(new Error(`GitHub API returned HTTP ${res.statusCode}: ${errBody.slice(0, 150)}`));
          });
          return;
        }

        if (res.headers.etag) {
          this.etag = res.headers.etag;
        }

        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            const sha = data.sha;
            const message = data.commit?.message || 'Update patch';
            const author = data.commit?.author?.name || data.author?.login || 'unknown';
            const date = data.commit?.author?.date || new Date().toISOString();
            resolve({ sha, message, author, date });
          } catch (e) {
            reject(new Error(`Failed to parse GitHub response: ${e.message}`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('GitHub API request timed out (12s)'));
      });

      req.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Check GitHub for updates on branch production.
   * If a new patch is detected and autoApply is true, triggers update.
   */
  async checkForUpdates(force = false) {
    if (this.isUpdating) {
      return this.getStatus();
    }

    this.status = 'checking';
    this.lastError = null;

    try {
      this.log(`Checking GitHub for patches in branch '${this.branch}'...`);
      const remoteInfo = await this.fetchRemoteCommit();

      this.lastCheckedAt = new Date().toISOString();

      if (remoteInfo.notModified && this.currentCommit && this.currentCommit !== 'unknown') {
        this.status = 'idle';
        this.log(`No new patches found on branch '${this.branch}' (304 Not Modified). Instance is up to date.`);
        return this.getStatus();
      }

      const remoteSha = remoteInfo.sha;
      this.latestCommit = remoteSha;
      this.latestCommitInfo = remoteInfo;

      // Update current commit if currently unknown
      if (!this.currentCommit || this.currentCommit === 'unknown') {
        this.currentCommit = remoteSha;
        try { fs.writeFileSync(this.commitFile, remoteSha, 'utf8'); } catch {}
        this.status = 'idle';
        return this.getStatus();
      }

      // Check if remote commit differs from local commit
      const hasUpdate = this.latestCommit && (this.latestCommit.toLowerCase() !== this.currentCommit.toLowerCase());

      if (hasUpdate) {
        const shortCur = this.currentCommit.substring(0, 7);
        const shortNew = this.latestCommit.substring(0, 7);
        const commitMsg = remoteInfo.message ? remoteInfo.message.split('\n')[0] : '';
        this.log(`🚀 New patch detected on '${this.branch}'! ${shortCur} -> ${shortNew}: "${commitMsg}"`);
        this.status = 'update-available';

        if (this.eventBus) {
          this.eventBus.emit('system:update_detected', {
            branch: this.branch,
            currentCommit: this.currentCommit,
            latestCommit: this.latestCommit,
            info: remoteInfo
          });
        }

        if (this.autoApply || force) {
          // Safeguard: if local git branch is a different feature branch (e.g. dev workspace),
          // don't automatically overwrite unless forced or branch matches target branch
          const currentBranch = this.getCurrentBranch();
          if (this.isGitRepo() && currentBranch && currentBranch !== this.branch && !this.allowForceBranchSwitch && !force) {
            this.log(`[AutoUpdater] Current branch '${currentBranch}' differs from target branch '${this.branch}'. Skipping automatic overwrite to preserve local branch work. (Set VALOR_FORCE_BRANCH_SWITCH=true or trigger manual update in Settings to force).`, 'warn');
            return this.getStatus();
          }

          this.log(`Auto-update triggered. Applying patch from branch '${this.branch}'...`);
          return await this.applyUpdate();
        }
      } else {
        this.status = 'idle';
        this.log(`Instance is up-to-date with branch '${this.branch}' (${this.currentCommit.substring(0, 7)}).`);
      }

      return this.getStatus();
    } catch (err) {
      this.status = 'error';
      this.lastError = err.message;
      this.lastCheckedAt = new Date().toISOString();
      this.log(`Failed to check GitHub for updates: ${err.message}`, 'error');
      return this.getStatus();
    }
  }

  /**
   * Apply the update: pulls the patch, runs dependency/build steps, and restarts.
   */
  async applyUpdate() {
    if (this.isUpdating) {
      this.log('Update already in progress. Ignoring duplicate call.', 'warn');
      return this.getStatus();
    }

    this.isUpdating = true;
    const oldCommit = this.currentCommit;
    const newCommit = this.latestCommit;

    try {
      this.status = 'downloading';
      this.log(`Applying patch for branch '${this.branch}' (${oldCommit?.substring(0, 7)} -> ${newCommit?.substring(0, 7)})...`);

      if (this.isGitRepo()) {
        await this.applyUpdateViaGit();
      } else {
        await this.applyUpdateViaArchive();
      }

      // Step 2: Install dependencies if package.json was modified
      this.status = 'applying';
      await this.runDependencyCheck();

      // Step 3: Rebuild production assets if dist or production mode is active
      if (this.isProd || fs.existsSync(path.join(this.appDir, 'dist'))) {
        this.status = 'building';
        await this.runBuild();
      }

      // Step 4: Record success in update history
      this.currentCommit = newCommit || this.detectCurrentCommit();
      try {
        fs.writeFileSync(this.commitFile, this.currentCommit, 'utf8');
      } catch {}

      this.recordHistory({
        timestamp: new Date().toISOString(),
        branch: this.branch,
        fromCommit: oldCommit,
        toCommit: this.currentCommit,
        info: this.latestCommitInfo
      });

      this.status = 'restarting';
      this.log(`✅ Patch applied successfully! Current commit is now ${this.currentCommit.substring(0, 7)}. Initiating instance restart...`);

      if (this.eventBus) {
        this.eventBus.emit('system:restarting', {
          reason: 'auto_update',
          branch: this.branch,
          commit: this.currentCommit
        });
      }

      // Step 5: Schedule graceful self-restart
      await this.scheduleRestart();

      return this.getStatus();
    } catch (err) {
      this.status = 'error';
      this.lastError = err.message;
      this.log(`Failed to apply patch: ${err.message}`, 'error');
      this.isUpdating = false;
      return this.getStatus();
    }
  }

  /**
   * Apply update via Git CLI.
   */
  async applyUpdateViaGit() {
    // Ensure data directory files are protected from git index
    try {
      execSync('git update-index --skip-worktree .valor_data/valor.db', { cwd: this.appDir, stdio: 'ignore' });
    } catch {}

    this.log(`Fetching latest changes from origin/${this.branch}...`);
    execSync(`git fetch origin ${this.branch}`, {
      cwd: this.appDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 45000
    });

    // Check if working tree has unstaged/uncommitted local modifications
    let isDirty = false;
    try {
      const statusOut = execSync('git status --porcelain', {
        cwd: this.appDir,
        stdio: ['ignore', 'pipe', 'ignore']
      }).toString().trim();
      isDirty = statusOut.length > 0;
    } catch {}

    if (isDirty) {
      this.log('Working directory has local modifications. Creating backup stash before applying patch...');
      try {
        execSync(`git stash push -u -m "valor-auto-update-backup-${Date.now()}"`, {
          cwd: this.appDir,
          stdio: ['ignore', 'pipe', 'ignore']
        });
      } catch (stashErr) {
        this.log(`Stash notice: ${stashErr.message}`, 'warn');
      }
    }

    // Checkout and align with branch
    const currentBranch = this.getCurrentBranch();
    if (currentBranch && currentBranch !== this.branch) {
      this.log(`Switching from '${currentBranch}' to '${this.branch}'...`);
      try {
        execSync(`git checkout ${this.branch}`, {
          cwd: this.appDir,
          stdio: ['ignore', 'pipe', 'pipe']
        });
      } catch {
        // If branch doesn't exist locally, create tracking branch
        execSync(`git checkout -B ${this.branch} origin/${this.branch}`, {
          cwd: this.appDir,
          stdio: ['ignore', 'pipe', 'pipe']
        });
      }
    }

    // Pull / Fast-forward / Reset hard to origin/branch
    this.log(`Updating local code to match origin/${this.branch}...`);
    execSync(`git reset --hard origin/${this.branch}`, {
      cwd: this.appDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000
    });
  }

  /**
   * Apply update by downloading and extracting the GitHub archive (for non-git installs).
   */
  async applyUpdateViaArchive() {
    this.log(`Downloading zip archive for branch '${this.branch}' from GitHub...`);
    const zipUrl = `https://github.com/${this.repo}/archive/refs/heads/${encodeURIComponent(this.branch)}.zip`;
    const tempZip = path.join(this.dataDir, `update_${Date.now()}.zip`);

    await new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(tempZip);
      
      const download = (url) => {
        https.get(url, { headers: { 'User-Agent': 'Valor-AutoUpdater' } }, (res) => {
          if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
            return download(res.headers.location);
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`Download failed with HTTP ${res.statusCode}`));
          }
          res.pipe(fileStream);
          fileStream.on('finish', () => fileStream.close(resolve));
        }).on('error', reject);
      };

      download(zipUrl);
    });

    this.log('Zip archive downloaded. Extracting updated files...');
    if (process.platform === 'win32') {
      const extractDir = path.join(this.dataDir, 'update_extracted');
      if (fs.existsSync(extractDir)) {
        fs.rmSync(extractDir, { recursive: true, force: true });
      }
      fs.mkdirSync(extractDir, { recursive: true });

      execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${tempZip}' -DestinationPath '${extractDir}' -Force"`, {
        timeout: 60000
      });

      // Find root folder inside zip
      const entries = fs.readdirSync(extractDir);
      const innerDir = entries.length === 1 && fs.statSync(path.join(extractDir, entries[0])).isDirectory()
        ? path.join(extractDir, entries[0])
        : extractDir;

      // Copy files over appDir, excluding .valor_data, node_modules, .env
      this.copyDirRecursive(innerDir, this.appDir, ['.valor_data', 'node_modules', '.env']);

      // Cleanup
      try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch {}
      try { fs.unlinkSync(tempZip); } catch {}
    } else {
      // Unix tar/unzip
      execSync(`unzip -o -q "${tempZip}" -d "${this.dataDir}/update_extracted"`);
      try { fs.unlinkSync(tempZip); } catch {}
    }
  }

  /**
   * Helper to recursively copy files while ignoring specified paths.
   */
  copyDirRecursive(src, dest, ignoreList = []) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const items = fs.readdirSync(src);
    for (const item of items) {
      if (ignoreList.includes(item)) continue;
      const srcPath = path.join(src, item);
      const destPath = path.join(dest, item);
      const stat = fs.statSync(srcPath);
      if (stat.isDirectory()) {
        this.copyDirRecursive(srcPath, destPath, ignoreList);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  /**
   * Runs dependency check and npm install if necessary.
   */
  async runDependencyCheck() {
    this.log('Checking dependencies...');
    try {
      execSync('npm --version', { stdio: 'ignore' });
    } catch {
      this.log('npm CLI not available in PATH; skipping npm install.', 'warn');
      return;
    }

    try {
      this.log('Running npm install --omit=dev --no-audit --no-fund...');
      execSync('npm install --omit=dev --no-audit --no-fund', {
        cwd: this.appDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 90000
      });
      this.log('Dependencies updated successfully.');
    } catch (err) {
      this.log(`npm install notice: ${err.message}`, 'warn');
    }
  }

  /**
   * Rebuilds production assets if necessary.
   */
  async runBuild() {
    this.log('Rebuilding production assets...');
    try {
      if (fs.existsSync(path.join(this.appDir, 'scripts', 'build.mjs'))) {
        execSync('node scripts/build.mjs', {
          cwd: this.appDir,
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 120000
        });
      } else {
        execSync('npm run build', {
          cwd: this.appDir,
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 120000
        });
      }
      this.log('Production build completed.');
    } catch (err) {
      this.log(`Build notice: ${err.message}`, 'warn');
    }
  }

  /**
   * Record update event to history file.
   */
  recordHistory(entry) {
    let history = [];
    try {
      if (fs.existsSync(this.historyFile)) {
        history = JSON.parse(fs.readFileSync(this.historyFile, 'utf8'));
      }
    } catch {}

    history.unshift(entry);
    if (history.length > 50) history = history.slice(0, 50);

    try {
      fs.writeFileSync(this.historyFile, JSON.stringify(history, null, 2), 'utf8');
    } catch {}
  }

  /**
   * Graceful self-restart:
   * Launches a detached helper that waits 1.5s for the old process to exit and free the ports,
   * then exits the current process.
   */
  async scheduleRestart() {
    const nodeExec = process.execPath || process.argv0;
    const scriptArgs = process.argv.slice(1);

    this.log('[AutoUpdater] Scheduling instance restart in 1.5 seconds...');

    const restartScript = `
      setTimeout(() => {
        const { spawn } = require('child_process');
        const child = spawn(${JSON.stringify(nodeExec)}, ${JSON.stringify(scriptArgs)}, {
          cwd: ${JSON.stringify(this.appDir)},
          detached: true,
          stdio: 'inherit',
          env: process.env
        });
        child.unref();
      }, 1500);
    `;

    try {
      const helper = spawn(nodeExec, ['-e', restartScript], {
        cwd: this.appDir,
        detached: true,
        stdio: 'ignore'
      });
      helper.unref();
    } catch (e) {
      this.log(`Failed to spawn restart helper: ${e.message}`, 'error');
    }

    setTimeout(() => {
      this.log('[AutoUpdater] Shutting down current process for replacement instance...');
      process.exit(0);
    }, 500);
  }

  /**
   * Handle incoming GitHub push webhook.
   */
  async handleGitHubWebhook(headers, body) {
    const event = headers['x-github-event'];
    if (event !== 'push') {
      return { handled: false, reason: `Ignored event: ${event}` };
    }

    const ref = body?.ref;
    const targetRef = `refs/heads/${this.branch}`;

    if (ref !== targetRef) {
      return { handled: false, reason: `Ref '${ref}' does not match target branch '${this.branch}'` };
    }

    this.log(`Webhook received: Push event on '${targetRef}'. Checking updates immediately...`);
    // Non-blocking trigger
    this.checkForUpdates(true).catch(err => {
      this.log(`Webhook triggered update error: ${err.message}`, 'error');
    });

    return { handled: true, success: true, message: `Update check triggered for branch '${this.branch}'` };
  }

  /**
   * Get serializable status object for API and UI consumption.
   */
  getStatus() {
    return {
      enabled: this.enabled,
      branch: this.branch,
      localBranch: this.getCurrentBranch(),
      repo: this.repo,
      currentCommit: this.currentCommit,
      currentCommitShort: this.currentCommit ? this.currentCommit.substring(0, 7) : 'unknown',
      latestCommit: this.latestCommit,
      latestCommitShort: this.latestCommit ? this.latestCommit.substring(0, 7) : null,
      latestCommitInfo: this.latestCommitInfo,
      lastCheckedAt: this.lastCheckedAt,
      updateAvailable: Boolean(this.latestCommit && this.currentCommit && this.latestCommit.toLowerCase() !== this.currentCommit.toLowerCase()),
      status: this.status,
      isUpdating: this.isUpdating,
      lastError: this.lastError,
      intervalMs: this.intervalMs,
      isGitRepo: this.isGitRepo()
    };
  }
}
