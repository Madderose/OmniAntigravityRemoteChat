function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${bytes || 0} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[index]}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export class FileBrowser {
  constructor(root, { fetchWithAuth, notify }) {
    this.root = root;
    this.fetchWithAuth = fetchWithAuth;
    this.notify = notify;
    this.currentPath = '.';
    this.currentFile = '';
    this.renderShell();
  }

  renderShell() {
    this.root.innerHTML = `
      <div class="workspace-section split-card">
        <div class="workspace-card file-browser-layout">
          <div class="panel-header">
            <div>
              <div class="panel-title">File Browser</div>
              <div class="panel-subtitle" id="fileBrowserPath">Workspace root</div>
            </div>
            <div class="screen-actions">
              <button class="panel-btn" id="fileBrowserUpBtn">Up</button>
              <button class="panel-btn" id="fileBrowserRefreshBtn">Refresh</button>
            </div>
          </div>
          <div class="file-browser-main">
            <div class="file-list" id="fileBrowserEntries"></div>
          </div>
        </div>
        <div class="workspace-card">
          <div class="panel-header">
            <div>
              <div class="panel-title">Preview</div>
              <div class="panel-subtitle" id="fileBrowserPreviewLabel">Select a file</div>
            </div>
          </div>
          <pre class="code-preview"><code id="fileBrowserPreview">Choose a file from the list to inspect its contents.</code></pre>
        </div>
      </div>
    `;

    this.pathLabel = this.root.querySelector('#fileBrowserPath');
    this.entriesNode = this.root.querySelector('#fileBrowserEntries');
    this.previewLabel = this.root.querySelector('#fileBrowserPreviewLabel');
    this.previewNode = this.root.querySelector('#fileBrowserPreview');

    this.root
      .querySelector('#fileBrowserRefreshBtn')
      .addEventListener('click', () => this.loadDirectory(this.currentPath));
    this.root
      .querySelector('#fileBrowserUpBtn')
      .addEventListener('click', () => this.goUp());
  }

  async init() {
    await this.loadDirectory('.');
  }

  goUp() {
    if (this.currentPath === '.' || !this.currentPath) return;
    const parts = String(this.currentPath).split(/[\\/]+/).filter(Boolean);
    parts.pop();
    const nextPath = parts.length ? parts.join('/') : '.';
    this.loadDirectory(nextPath);
  }

  async loadDirectory(path = '.') {
    try {
      const response = await this.fetchWithAuth(
        `/api/fs/ls?path=${encodeURIComponent(path)}`
      );
      const payload = await response.json();
      this.currentPath = payload.path || '.';
      this.pathLabel.textContent = this.currentPath === '.' ? payload.root : this.currentPath;

      if (!payload.entries?.length) {
        this.entriesNode.innerHTML =
          '<div class="workspace-empty">This folder is empty.</div>';
        return;
      }

      this.entriesNode.innerHTML = payload.entries
        .map(
          (entry) => `
            <div class="file-entry ${this.currentFile === entry.path ? 'active' : ''}">
              <button type="button" data-path="${entry.path}" data-type="${entry.type}">
                <strong>${entry.type === 'directory' ? '▸' : '•'} ${escapeHtml(entry.name)}</strong>
                <div class="file-entry-meta">
                  ${entry.type === 'directory' ? 'Folder' : `${escapeHtml(entry.extension || 'file')} · ${formatBytes(entry.size)}`}
                </div>
              </button>
            </div>
          `
        )
        .join('');

      this.entriesNode.querySelectorAll('button[data-path]').forEach((button) => {
        button.addEventListener('click', () => {
          const nextPath = button.getAttribute('data-path') || '.';
          const type = button.getAttribute('data-type');
          if (type === 'directory') {
            this.loadDirectory(nextPath);
          } else {
            this.openFile(nextPath);
          }
        });
      });
    } catch (error) {
      this.notify(`Failed to load directory: ${error.message}`, 'error');
    }
  }

  async openFile(path) {
    try {
      const response = await this.fetchWithAuth(
        `/api/fs/cat?path=${encodeURIComponent(path)}`
      );
      const payload = await response.json();
      this.currentFile = path;
      this.previewLabel.textContent = `${payload.path}${payload.truncated ? ' · truncated' : ''}`;
      this.previewNode.className = `language-${payload.language || 'clike'}`;
      this.previewNode.textContent = payload.content;
      if (window.Prism?.highlightElement) {
        window.Prism.highlightElement(this.previewNode);
      }
      await this.loadDirectory(this.currentPath);
    } catch (error) {
      this.notify(`Failed to read file: ${error.message}`, 'error');
    }
  }
}
