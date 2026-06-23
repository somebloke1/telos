# Telos Installation Guide

## Quick Installation

The telos extension can be installed in several ways depending on your needs.

## Method 1: Auto-Discovery (Recommended)

Pi automatically discovers extensions from specific directories:

### Global Installation
```bash
# Copy extension to global extensions directory
cp -r /path/to/telos/src ~/.pi/agent/extensions/telos
```

### Project-Local Installation
```bash
# Create .pi directory in your project
mkdir -p .pi/extensions

# Copy extension files
cp -r /path/to/telos/src .pi/extensions/telos
```

## Method 2: Direct Load (Development)

For quick testing without installation:

```bash
cd /home/dgk/workspace/telos
pi -e ./src/index.ts
```

## Method 3: GitHub Clone

```bash
# Clone the repository
git clone https://github.com/somebloke1/telos.git ~/.pi/agent/extensions/telos
```

## Verification

After installation, verify the extension is loaded:

```bash
# Start Pi
pi

# In the TUI, try the commands:
/goal help
/goalchain help
```

Or check if commands are available via the API:

```bash
# Check available commands
pi --list-commands 2>&1 | grep -i goal
```

## Troubleshooting

### Commands Not Showing

If `/goal` and `/goalchain` commands don't appear:

1. **Check Extension Location**
   ```bash
   # Verify files are in the right place
   ls -la ~/.pi/agent/extensions/telos/
   # Should show: index.ts, goal-*.ts files
   ```

2. **Check File Structure**
   ```bash
   # The extension must be in a telos/ subdirectory
   ~/.pi/agent/extensions/
   └── telos/
       ├── index.ts
       ├── goal-chain.ts
       ├── goal-continuation.ts
       ├── goal-manager.ts
       └── goal-tools.ts
   ```

3. **Check for Syntax Errors**
   ```bash
   # Verify TypeScript syntax
   cd ~/.pi/agent/extensions/telos
   npx tsc --noEmit index.ts
   # Some type errors are expected (missing Pi dependencies)
   ```

4. **Restart Pi**
   ```bash
   # Exit and restart Pi
   # /exit or Ctrl+C
   pi
   ```

5. **Check Pi Version**
   ```bash
   pi --version
   # Telos requires Pi 1.0 or later
   ```

### Extension Not Loading

If the extension doesn't load:

1. **Check Console Output**
   ```bash
   pi 2>&1 | tee /tmp/pi-debug.log
   # Look for error messages related to telos
   ```

2. **Verify Dependencies**
   ```bash
   # Check if Pi dependencies are accessible
   node -e "console.log(require('@earendil-works/pi-coding-agent'))"
   ```

3. **Test Extension Directly**
   ```bash
   # Try loading the extension directly
   pi -e ~/.pi/agent/extensions/telos/index.ts
   ```

### Commands Work But Tools Don't

If commands work but LLM tools aren't available:

1. **Check Tool Registration**
   ```bash
   # In Pi session, try:
   /help
   # Look for goal-related tools
   ```

2. **Verify Tool Registration Code**
   ```bash
   # Check that tools are registered in index.ts
   grep "registerTool" ~/.pi/agent/extensions/telos/index.ts
   ```

## Development Setup

For active development:

```bash
# Clone repository
git clone https://github.com/somebloke1/telos.git
cd telos

# Create symlink for easy loading
ln -s $(pwd)/src ~/.pi/agent/extensions/telos

# Start Pi with extension
pi

# Make changes to src/
# Reload with: /reload
```

## Project-Local Installation

For per-project installation:

```bash
# In your project directory
cd /path/to/your/project

# Create .pi directory
mkdir -p .pi/extensions

# Copy telos extension
cp -r /path/to/telos/src .pi/extensions/telos

# Start Pi (auto-discovers project-local extensions)
pi

# Telos commands will be available
```

## Configuration

### Environment Variables

No environment variables required for basic usage.

### Pi Configuration

If you need to customize:

```json
{
  "extensions": [
    "/path/to/telos/src"
  ]
}
```

## Upgrading

### From Development Version

```bash
# Pull latest changes
cd /path/to/telos
git pull

# Restart Pi
# /exit or Ctrl+C
pi
```

### From GitHub Release

```bash
# Download latest release
wget https://github.com/somebloke1/telos/archive/refs/tags/v0.2.0.tar.gz

# Extract and install
tar -xzf v0.2.0.tar.gz
cp -r telos-0.2.0/src ~/.pi/agent/extensions/telos

# Restart Pi
pi
```

## Uninstallation

### Remove Extension

```bash
# Remove extension files
rm -rf ~/.pi/agent/extensions/telos

# Or for project-local
rm -rf .pi/extensions/telos
```

### Clean Configuration

```bash
# Remove from settings.json if manually added
# Edit ~/.pi/settings.json and remove telos entry
```

## Verification Commands

After installation, verify everything works:

```bash
# Test basic goal command
echo "/goal Test installation" | pi

# Test goal chain command
echo "/goalchain list" | pi

# Check for errors
pi 2>&1 | grep -i error
```

## Performance Considerations

- **Extension Size**: Telos is lightweight (~30KB of source code)
- **Memory Usage**: Minimal overhead, state stored in session
- **Load Time**: Instant, no compilation required
- **Runtime**: No performance impact when not actively used

## Security Considerations

- **Code Review**: Always review extension code before installation
- **Permissions**: Extensions run with your full system permissions
- **Network**: Telos doesn't make external network requests
- **Data**: Goals stored in plain text in session files

## Getting Help

If installation fails:

1. Check this guide's troubleshooting section
2. Review GitHub Issues: https://github.com/somebloke1/telos/issues
3. Create a new issue with:
   - Pi version (`pi --version`)
   - Installation method used
   - Error messages
   - Steps to reproduce

## Alternative Installation Methods

### Using npm (Future)

```bash
# When published to npm
npm install -g @somebloke1/telos

# Pi will auto-discover from node_modules
pi
```

### Using pi install (Future)

```bash
# When pi package system is available
pi install github:somebloke1/telos@v0.2.0
```

---

**Last Updated**: 2026-06-23
**Version**: 0.2.0
**Pi Version Required**: 1.0+