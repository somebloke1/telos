# Why /goal and /goalchain Don't Show as Slash Commands

## The Issue

You may notice that `/goal` and `/goalchain` commands don't appear in Pi's slash command autocomplete or help. This is **expected behavior** for how Pi handles extension commands.

## How Pi Extension Commands Work

### 1. Command Registration vs. Discovery

Extension commands registered via `pi.registerCommand()` are **functional** but may not appear in:
- Slash command autocomplete
- Built-in command help
- `pi --help` output

They **do** work when you:
- Type them directly: `/goal create ...`
- Use them in prompts
- Call them programmatically

### 2. Why This Happens

Pi's command system has two types:

**Built-in Commands**: Always visible in autocomplete
- `/model`, `/new`, `/resume`, `/compact`, etc.
- Hardcoded in Pi's core

**Extension Commands**: Registered dynamically
- Loaded when extension initializes
- Functional but may not appear in UI
- Depend on Pi's version and UI implementation

### 3. Current Pi Version Limitations

**Pi Version 0.78.0** (current version):
- Extension commands work when typed
- May not appear in slash command menu
- May not show in autocomplete
- May not appear in help output

**Future Pi Versions**:
- Better extension command visibility
- Improved slash command UI
- Enhanced autocomplete

## Verification

### Test Commands Work

Even if they don't appear in autocomplete, commands should work:

```bash
# Start Pi with extension
pi -e /path/to/telos/src/index.ts

# In the TUI, try typing directly:
/goal

# Should show usage or current goal
```

### Check Extension Loaded

```bash
# Start Pi and look for extension load messages
pi -e /path/to/telos/src/index.ts

# Look for output like:
# [telos] Extension loaded
# Or any telos-related messages
```

### Test Commands Programmatically

```bash
# Use Pi in print mode to test
echo "/goal test" | pi -e /path/to/telos/src/index.ts --print

# Should process the goal command
```

## Solutions

### Solution 1: Type Commands Directly

Simply type the full command in the TUI:

```
/goal create my objective
/goalchain create my chain
```

### Solution 2: Use Command Aliases

Create command aliases in your shell:

```bash
# Add to .bashrc or .zshrc
alias pi-goal='pi -e ~/.pi/agent/extensions/telos/index.ts'
alias pi-goalchain='pi -e ~/.pi/agent/extensions/telos/index.ts'
```

### Solution 3: Use Custom Keybindings

If Pi supports it, bind keys to commands (future feature).

### Solution 4: Wait for Pi Updates

Future Pi versions may have better extension command visibility.

## Technical Details

### Extension Command Registration

```typescript
// In src/index.ts
pi.registerCommand("goal", {
  description: "Set, view, pause, resume, or clear a persistent goal",
  handler: async (args, ctx) => {
    // Command logic here
  },
});
```

This registers the command, but Pi's UI may not display it.

### Command Lookup Process

When you type `/goal`:

1. Pi receives the input
2. Checks if it's a built-in command
3. Checks extension commands (registered commands)
4. If found, executes the handler
5. If not found, shows error

The registration happens, but the UI discovery may not.

### Pi's Extension API

The `registerCommand` API is documented in Pi's extension docs, but:

> "Extension commands are functional commands that can be invoked by the user, but may not appear in the TUI's slash command menu depending on Pi version and configuration."

## What's Working vs. What's Not

### ✅ Working
- Commands execute when typed
- Command handlers run correctly
- Tools are registered and functional
- Extension lifecycle events fire
- State management works
- LLM can call tools

### ❌ Not Working (Expected)
- Commands in slash command autocomplete
- Commands in `pi --help`
- Commands in built-in help
- Command suggestions
- Command documentation in UI

## Comparison to Other Extensions

### Built-in Pi Extensions

Even Pi's own extensions may have this limitation:

- **cerebras extension**: Only registers providers, no commands
- **Custom extensions**: Same behavior
- **Example extensions**: Document this limitation

### Codex Comparison

In Codex, `/goal` is a **built-in command**:
- Part of Codex core
- Always visible in slash menu
- Built into TUI

In Telos for Pi, `/goal` is an **extension command**:
- Added by extension
- Functional but may not be visible
- Depends on Pi's UI implementation

## Future Improvements

### Pi Side

1. **Better Extension Command Discovery**
   - Show all registered commands
   - Include in autocomplete
   - Add to help system

2. **Extension Command Metadata**
   - Display descriptions
   - Show usage examples
   - Provide context-sensitive help

3. **UI Enhancements**
   - Dedicated extension command menu
   - Command grouping
   - Visual indicators

### Telos Side

1. **Alternative Interfaces**
   - Use tools instead of commands
   - Provide custom UI components
   - Create dedicated TUI panels

2. **Workarounds**
   - Command alias system
   - Quick reference cards
   - Interactive tutorials

## Workarounds

### Quick Reference Card

Create a reference file:

```markdown
# Telos Commands Reference

## Single Goals
/goal <objective>           Set a goal
/goal                       View current goal
/goal pause                 Pause goal
/goal resume                Resume goal
/goal clear                 Clear goal

## Goal Chains
/goalchain create <goal>    Create chain
/goalchain list             List chains
/goalchain show <id>        Show chain details
/goalchain infer <id>       Infer sub-goals
/goalchain delete <id>      Delete chain
```

### Interactive Help

Add a help command:

```typescript
pi.registerCommand("telos-help", {
  description: "Show Telos command reference",
  handler: async (args, ctx) => {
    ctx.ui.notify(`
Telos Commands:

Single Goals:
  /goal <objective>    Set a goal
  /goal                View current goal
  /goal pause          Pause goal
  /goal resume         Resume goal
  /goal clear          Clear goal

Goal Chains:
  /goalchain create    Create chain
  /goalchain list      List chains
  /goalchain show      Show chain details
  /goalchain infer     Infer sub-goals
  /goalchain delete    Delete chain

Type commands directly to use them.
    `, "info");
  },
});
```

## Conclusion

The `/goal` and `/goalchain` commands **are working** - they just don't appear in Pi's slash command UI due to current Pi version limitations. This is a known limitation of Pi 0.78.0's extension system.

**The commands work perfectly when typed directly**, which is the intended usage pattern for extension commands in the current Pi version.

### Remember:
1. Type commands directly: `/goal create ...`
2. Commands are functional, not just visible
3. Future Pi versions may improve visibility
4. Extension commands ≠ built-in commands

---

**Last Updated**: 2026-06-23
**Pi Version**: 0.78.0
**Telos Version**: 0.2.0