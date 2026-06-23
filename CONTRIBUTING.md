# Contributing to Telos

Thank you for your interest in contributing to Telos! This document provides guidelines for contributing to the project.

## Development Setup

1. **Clone the repository**

```bash
git clone https://github.com/somebloke1/telos.git
cd telos
```

2. **Install dependencies** (if any are added in the future)

```bash
npm install
```

3. **Test the extension locally**

```bash
pi -e ./src/index.ts
```

Or create a symlink in your Pi extensions directory:

```bash
ln -s /path/to/telos ~/.pi/agent/extensions/telos
```

## Code Style

- Use TypeScript for all code
- Follow the existing code structure and naming conventions
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions focused and modular

## Project Structure

```
telos/
├── src/
│   ├── index.ts           # Main extension entry point
│   ├── goal-manager.ts    # Goal state management
│   ├── goal-tools.ts      # LLM-facing tool implementations
│   └── goal-continuation.ts  # Automatic continuation logic
├── docs/
│   └── research/
│       └── codex_goal_feature_research.md
├── package.json
├── README.md
├── CONTRIBUTING.md
└── LICENSE.md
```

## Making Changes

1. **Create a feature branch**

```bash
git checkout -b feature/your-feature-name
```

2. **Make your changes**
   - Edit source files in `src/`
   - Test thoroughly with Pi
   - Update documentation if needed

3. **Test your changes**

```bash
# Test locally
pi -e ./src/index.ts

# Try the various /goal commands
# Test the LLM tools (get_goal, create_goal, update_goal)
# Verify continuation works correctly
```

4. **Commit your changes**

```bash
git add .
git commit -m "feat: add your feature description"
```

Use conventional commits:
- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `refactor:` - Code refactoring
- `test:` - Test additions/changes
- `chore:` - Maintenance tasks

## Testing

Since this is a Pi extension, manual testing is essential:

### Test Cases

- [ ] Setting a new goal with `/goal <objective>`
- [ ] Viewing current goal with `/goal`
- [ ] Pausing a goal with `/goal pause`
- [ ] Resuming a paused goal with `/goal resume`
- [ ] Clearing a goal with `/goal clear`
- [ ] Replacing a non-complete goal (should prompt for confirmation)
- [ ] LLM calling `get_goal`
- [ ] LLM calling `create_goal`
- [ ] LLM calling `update_goal` with `complete` status
- [ ] LLM calling `update_goal` with `blocked` status
- [ ] Automatic continuation triggering
- [ ] Token budget tracking
- [ ] Budget limit behavior
- [ ] Session persistence (goal survives reload)
- [ ] Error handling (invalid objectives, empty goals, etc.)

### Edge Cases

- [ ] Very long objectives (> 4000 chars) should be rejected
- [ ] Empty objectives should be rejected
- [ ] Creating a goal when one already exists should fail
- [ ] Invalid status transitions should be rejected
- [ ] Token budget of 0 or negative should be rejected
- [ ] Continuation should not trigger too frequently
- [ ] Continuation should respect paused/blocked states

## Pull Requests

1. **Fork the repository**
2. **Create a feature branch**
3. **Make your changes and test thoroughly**
4. **Push to your fork**
5. **Submit a pull request**

Please include in your PR:
- Clear description of changes
- Testing performed
- Related issue numbers (if applicable)
- Screenshots or examples (if UI changes)

## Documentation

Keep documentation updated:
- Update `README.md` for user-facing changes
- Update inline code comments for technical details
- Add new research findings to `docs/research/`
- Update this file if contributing guidelines change

## Questions or Issues?

- Open an issue on GitHub for bugs or feature requests
- Start a discussion for questions or ideas
- Check existing issues and discussions first

## Code of Conduct

Be respectful and constructive:
- Treat others with respect
- Focus on what is best for the community
- Show empathy towards other community members

Thank you for contributing to Telos!